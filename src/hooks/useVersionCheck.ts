import { useState, useEffect } from 'react'
import { api } from '../api'

const LOCAL_VERSION = '1.7.0'
const CHECK_INTERVAL = 30 * 60 * 1000 // 30分钟检查一次

interface DownloadInfo {
  name: string
  url: string
  size?: number
  label?: string
}

interface VersionInfo {
  version: string
  buildTime?: string
  downloads: DownloadInfo[]
}

function parseVersion(v: string) {
  return v.split('.').map(Number)
}

function isNewer(serverVer: string, localVer: string) {
  const s = parseVersion(serverVer)
  const l = parseVersion(localVer)
  for (let i = 0; i < Math.max(s.length, l.length); i++) {
    const sv = s[i] || 0
    const lv = l[i] || 0
    if (sv > lv) return true
    if (sv < lv) return false
  }
  return false
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
        if (isNewer(info.version, LOCAL_VERSION)) {
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
