import { useState, useEffect } from 'react'
import { api } from '../api'

const LOCAL_VERSION = '1.5.0'
const CHECK_INTERVAL = 30 * 60 * 1000 // 30分钟检查一次

interface DownloadInfo {
  name: string
  url: string
  size: number
}

interface VersionInfo {
  version: string
  buildTime?: string
  downloads: DownloadInfo[]
}

export function useVersionCheck() {
  const [latestVersion, setLatestVersion] = useState<VersionInfo | null>(null)
  const [hasUpdate, setHasUpdate] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const info = await api.version.check()
        setLatestVersion(info)
        // 比较版本号
        if (info.version !== LOCAL_VERSION) {
          setHasUpdate(true)
        }
      } catch (e) {
        // 静默失败
      }
    }

    // 首次检查延迟5秒
    const timer = setTimeout(checkVersion, 5000)
    // 定期检查
    const interval = setInterval(checkVersion, CHECK_INTERVAL)

    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [])

  const dismiss = () => setDismissed(true)

  return { hasUpdate: hasUpdate && !dismissed, latestVersion, dismiss, localVersion: LOCAL_VERSION }
}
