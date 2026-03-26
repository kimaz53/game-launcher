import Head from 'next/head'

export default function SettingsPage() {
  return (
    <>
      <Head>
        <title>Settings</title>
      </Head>
      <div className="h-full min-h-0 rounded-xl bg-white/5 p-6">
        <div className="flex h-full items-center justify-center text-3xl text-white/80">
          Settings
        </div>
      </div>
    </>
  )
}

