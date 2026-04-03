package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	igdbAPIURL       = "https://api.igdb.com/v4"
	twitchTokenURL   = "https://id.twitch.tv/oauth2/token"
	igdbImageBase    = "https://images.igdb.com/igdb/image/upload"
	igdbRateInterval = 260 * time.Millisecond // IGDB allows ~4 requests / second
	igdbHTTPTimeout  = 45 * time.Second
	maxDownloadBytes = 12 * 1024 * 1024
	envFileName      = "igdb.local.env"
)

type igdbTokenState struct {
	mu       sync.Mutex
	token    string
	expiry   time.Time
	clientID string
	secret   string
}

type igdbRateLimiter struct {
	mu      sync.Mutex
	lastReq time.Time
}

var (
	igdbTok  igdbTokenState
	igdbRL   igdbRateLimiter
	httpIGDB = &http.Client{Timeout: igdbHTTPTimeout}
)

func parseIGDBEnvBytes(b []byte) (clientID, secret string) {
	for _, line := range strings.Split(string(b), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k, v = strings.TrimSpace(k), strings.TrimSpace(v)
		switch strings.ToUpper(k) {
		case "TWITCH_CLIENT_ID":
			clientID = v
		case "TWITCH_CLIENT_SECRET":
			secret = v
		}
	}
	return clientID, secret
}

func (a *App) igdbEnvFileCandidates() []string {
	seen := map[string]struct{}{}
	var out []string
	add := func(p string) {
		p = filepath.Clean(p)
		if p == "" || p == "." {
			return
		}
		if _, ok := seen[p]; ok {
			return
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}

	exePath, err := os.Executable()
	if err == nil {
		dir := filepath.Dir(exePath)
		add(filepath.Join(dir, envFileName))
		add(filepath.Join(dir, "..", envFileName))
		add(filepath.Join(dir, "..", "..", envFileName))
	}
	if d, err := a.portableDataDir(); err == nil {
		add(filepath.Join(d, envFileName))
	}
	return out
}

func (a *App) loadIGDBCreds() (clientID, secret string) {
	if id := strings.TrimSpace(os.Getenv("TWITCH_CLIENT_ID")); id != "" {
		if sec := strings.TrimSpace(os.Getenv("TWITCH_CLIENT_SECRET")); sec != "" {
			return id, sec
		}
	}
	for _, p := range a.igdbEnvFileCandidates() {
		b, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		id, sec := parseIGDBEnvBytes(b)
		if id != "" && sec != "" {
			return id, sec
		}
	}
	return "", ""
}

// IGDBEnvHintPath returns a representative path for UI hints (first candidate or empty).
func (a *App) IGDBEnvHintPath() string {
	c := a.igdbEnvFileCandidates()
	if len(c) == 0 {
		return ""
	}
	return c[0]
}

// IGDBCredentialsConfigured reports whether Twitch client ID and secret are available.
func (a *App) IGDBCredentialsConfigured() bool {
	id, sec := a.loadIGDBCreds()
	return id != "" && sec != ""
}

func (igdbRL *igdbRateLimiter) wait() {
	igdbRL.mu.Lock()
	defer igdbRL.mu.Unlock()
	if d := igdbRateInterval - time.Since(igdbRL.lastReq); d > 0 {
		time.Sleep(d)
	}
	igdbRL.lastReq = time.Now()
}

func (t *igdbTokenState) get(a *App) (clientID, bearer string, err error) {
	id, sec := a.loadIGDBCreds()
	if id == "" || sec == "" {
		return "", "", errors.New("IGDB: set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET or create igdb.local.env next to the executable (see igdb.local.env.example)")
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	if t.token != "" && time.Now().Before(t.expiry.Add(-2*time.Minute)) && t.clientID == id && t.secret == sec {
		return id, t.token, nil
	}

	igdbRL.wait()
	form := url.Values{}
	form.Set("client_id", id)
	form.Set("client_secret", sec)
	form.Set("grant_type", "client_credentials")

	req, err := http.NewRequest(http.MethodPost, twitchTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := httpIGDB.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("twitch token: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("twitch token: %s — %s", resp.Status, strings.TrimSpace(string(body)))
	}

	var tok struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &tok); err != nil {
		return "", "", fmt.Errorf("twitch token parse: %w", err)
	}
	if tok.AccessToken == "" {
		return "", "", errors.New("twitch token: empty access_token")
	}

	t.token = tok.AccessToken
	t.clientID = id
	t.secret = sec
	if tok.ExpiresIn > 0 {
		t.expiry = time.Now().Add(time.Duration(tok.ExpiresIn) * time.Second)
	} else {
		t.expiry = time.Now().Add(50 * 24 * time.Hour)
	}
	return id, t.token, nil
}

func (a *App) igdbPOST(apipath string, body string) ([]byte, error) {
	clientID, bearer, err := igdbTok.get(a)
	if err != nil {
		return nil, err
	}
	igdbRL.wait()
	req, err := http.NewRequest(http.MethodPost, igdbAPIURL+apipath, bytes.NewReader([]byte(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Client-ID", clientID)
	req.Header.Set("Authorization", "Bearer "+bearer)
	req.Header.Set("Accept", "application/json")

	resp, err := httpIGDB.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("igdb %s: %s — %s", apipath, resp.Status, strings.TrimSpace(string(out)))
	}
	return out, nil
}

func igdbImageURL(imageID, size string) string {
	imageID = strings.TrimSpace(imageID)
	if imageID == "" {
		return ""
	}
	if size == "" {
		size = "t_cover_big"
	}
	return fmt.Sprintf("%s/%s/%s.jpg", igdbImageBase, size, imageID)
}

// IGDBSearchGames returns JSON: [{"id":1,"name":"...","coverImageId":"co…","releaseSec":123}] (releaseSec optional).
func (a *App) IGDBSearchGames(query string) (string, error) {
	q := strings.TrimSpace(query)
	if q == "" {
		return "[]", nil
	}

	apimapQuery := fmt.Sprintf(`search "%s";
fields id,name,cover.image_id,first_release_date;
limit 20;
`, escapeIGQLString(q))

	b, err := a.igdbPOST("/games", apimapQuery)
	if err != nil {
		return "", err
	}

	var raw []struct {
		ID               int64  `json:"id"`
		Name             string `json:"name"`
		FirstReleaseDate *int64 `json:"first_release_date"`
		Cover            *struct {
			ImageID string `json:"image_id"`
		} `json:"cover"`
	}
	if err := json.Unmarshal(b, &raw); err != nil {
		return "", fmt.Errorf("igdb search parse: %w", err)
	}

	type row struct {
		ID           int64  `json:"id"`
		Name         string `json:"name"`
		CoverImageID string `json:"coverImageId,omitempty"`
		ReleaseSec   *int64 `json:"releaseSec,omitempty"`
	}
	out := make([]row, 0, len(raw))
	for _, g := range raw {
		r := row{ID: g.ID, Name: g.Name, ReleaseSec: g.FirstReleaseDate}
		if g.Cover != nil && g.Cover.ImageID != "" {
			r.CoverImageID = g.Cover.ImageID
		}
		out = append(out, r)
	}
	enc, err := json.Marshal(out)
	if err != nil {
		return "[]", err
	}
	return string(enc), nil
}

func escapeIGQLString(s string) string {
	return strings.ReplaceAll(s, `"`, `\"`)
}

// IGDBFetchGameArt downloads cover (t_cover_big), icon (t_cover_small), and the first screenshot (t_screenshot_big) to temp files.
// Returns JSON including metadata: summary, genres, trailer (YouTube id), screenshotUrls (HTTPS, for UI preview).
func (a *App) IGDBFetchGameArt(gameID int64) (string, error) {
	if gameID <= 0 {
		return "", errors.New("invalid game id")
	}

	body := fmt.Sprintf(`fields name,cover.image_id,artworks.image_id,screenshots.image_id,summary,storyline,first_release_date,genres.name,videos.video_id;
where id = %d;
limit 1;
`, gameID)

	b, err := a.igdbPOST("/games", body)
	if err != nil {
		return "", err
	}

	var raw []struct {
		Name             string  `json:"name"`
		Summary          string  `json:"summary"`
		Storyline        string  `json:"storyline"`
		FirstReleaseDate *int64  `json:"first_release_date"`
		Genres           []struct {
			Name string `json:"name"`
		} `json:"genres"`
		Cover *struct {
			ImageID string `json:"image_id"`
		} `json:"cover"`
		Artworks []struct {
			ImageID string `json:"image_id"`
		} `json:"artworks"`
		Screenshots []struct {
			ImageID string `json:"image_id"`
		} `json:"screenshots"`
		Videos []struct {
			VideoID string `json:"video_id"`
		} `json:"videos"`
	}
	if err := json.Unmarshal(b, &raw); err != nil {
		return "", fmt.Errorf("igdb game parse: %w", err)
	}
	if len(raw) == 0 {
		return "", errors.New("game not found in IGDB")
	}
	g := raw[0]

	imageID := ""
	if g.Cover != nil && g.Cover.ImageID != "" {
		imageID = g.Cover.ImageID
	} else if len(g.Artworks) > 0 && g.Artworks[0].ImageID != "" {
		imageID = g.Artworks[0].ImageID
	} else if len(g.Screenshots) > 0 && g.Screenshots[0].ImageID != "" {
		imageID = g.Screenshots[0].ImageID
	}

	var genres []string
	seenGenre := map[string]struct{}{}
	for _, ge := range g.Genres {
		n := strings.TrimSpace(ge.Name)
		if n == "" {
			continue
		}
		k := strings.ToLower(n)
		if _, ok := seenGenre[k]; ok {
			continue
		}
		seenGenre[k] = struct{}{}
		genres = append(genres, n)
	}

	trailerID := ""
	for _, v := range g.Videos {
		t := strings.TrimSpace(v.VideoID)
		if t != "" {
			trailerID = t
			break
		}
	}

	const maxPreviewShots = 8
	var shotURLs []string
	for _, sh := range g.Screenshots {
		if len(shotURLs) >= maxPreviewShots {
			break
		}
		sid := strings.TrimSpace(sh.ImageID)
		if sid == "" {
			continue
		}
		if u := igdbImageURL(sid, "t_screenshot_big"); u != "" {
			shotURLs = append(shotURLs, u)
		}
	}

	type artOut struct {
		IgdbID            int64    `json:"igdbId"`
		Name              string   `json:"name"`
		CoverPath         string   `json:"coverPath"`
		IconPath          string   `json:"iconPath"`
		ScreenshotPath    string   `json:"screenshotPath"`
		Summary           string   `json:"summary,omitempty"`
		Storyline         string   `json:"storyline,omitempty"`
		ReleaseSec        *int64   `json:"releaseSec,omitempty"`
		Genres            []string `json:"genres,omitempty"`
		TrailerYouTubeID  string   `json:"trailerYouTubeId,omitempty"`
		ScreenshotURLs    []string `json:"screenshotUrls,omitempty"`
	}
	empty, _ := json.Marshal(artOut{IgdbID: gameID, Name: g.Name})

	var coverPath, iconPath, screenshotPath string

	if len(g.Screenshots) > 0 {
		sid := strings.TrimSpace(g.Screenshots[0].ImageID)
		if sid != "" {
			sURL := igdbImageURL(sid, "t_screenshot_big")
			if sURL != "" {
				igdbRL.wait()
				if p, err := downloadToTemp(sURL, "igdb-screenshot-", ".jpg"); err == nil {
					screenshotPath = p
				}
			}
		}
	}

	baseMeta := artOut{
		IgdbID:           gameID,
		Name:             g.Name,
		Summary:          strings.TrimSpace(g.Summary),
		Storyline:        strings.TrimSpace(g.Storyline),
		ReleaseSec:       g.FirstReleaseDate,
		Genres:           genres,
		TrailerYouTubeID: trailerID,
		ScreenshotURLs:   shotURLs,
	}

	if imageID == "" {
		baseMeta.ScreenshotPath = screenshotPath
		enc, err := json.Marshal(baseMeta)
		if err != nil {
			return string(empty), nil
		}
		return string(enc), nil
	}

	coverURL := igdbImageURL(imageID, "t_cover_big")
	iconURL := igdbImageURL(imageID, "t_cover_small")

	if coverURL != "" {
		igdbRL.wait()
		p, err := downloadToTemp(coverURL, "igdb-cover-", ".jpg")
		if err == nil {
			coverPath = p
		}
	}
	if iconURL != "" {
		igdbRL.wait()
		p, err := downloadToTemp(iconURL, "igdb-icon-", ".jpg")
		if err == nil {
			iconPath = p
		}
	}

	baseMeta.CoverPath = coverPath
	baseMeta.IconPath = iconPath
	baseMeta.ScreenshotPath = screenshotPath
	enc, err := json.Marshal(baseMeta)
	if err != nil {
		return string(empty), nil
	}
	return string(enc), nil
}

func downloadToTemp(srcURL, prefix, ext string) (string, error) {
	req, err := http.NewRequest(http.MethodGet, srcURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := httpIGDB.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 8*1024))
		return "", fmt.Errorf("download: %s", resp.Status)
	}
	f, err := os.CreateTemp("", prefix+"*"+ext)
	if err != nil {
		return "", err
	}
	path := f.Name()
	n, err := io.Copy(f, io.LimitReader(resp.Body, maxDownloadBytes))
	_ = f.Close()
	if err != nil {
		_ = os.Remove(path)
		return "", err
	}
	if n == 0 {
		_ = os.Remove(path)
		return "", errors.New("empty download")
	}
	return path, nil
}
