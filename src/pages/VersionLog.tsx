import { useState } from 'react'
import versions from '../data/versions.json'
import { api } from '../api'

const LOCAL_VERSION = versions[0]?.version || '1.0.0'

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

export function VersionLog() {
  const [checking, setChecking] = useState(false)
  const [versionInfo, setVersionInfo] = useState<any>(null)
  const [versionMsg, setVersionMsg] = useState('')

  async function checkUpdate() {
    setChecking(true)
    setVersionMsg('')
    try {
      const info = await api.version.check()
      setVersionInfo(info)
      if (isNewer(info.version, LOCAL_VERSION)) {
        setVersionMsg(`🔄 发现新版本 v${info.version}`)
      } else if (info.version === LOCAL_VERSION) {
        setVersionMsg('✅ 当前已是最新版本')
      } else {
        setVersionMsg('✅ 当前已是最新版本')
      }
    } catch {
      setVersionMsg('❌ 检查失败，请稍后重试')
    }
    setChecking(false)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>📋 版本更新记录</h1>
        <p className="page-subtitle">系统版本迭代与功能更新日志</p>
      </div>

      <div className="version-check-card">
        <div className="version-check-left">
          <span className="version-check-label">当前版本</span>
          <span className="version-check-ver">v{LOCAL_VERSION}</span>
        </div>
        <button 
          className="version-check-btn" 
          onClick={checkUpdate} 
          disabled={checking}
        >
          {checking ? '检查中...' : '🔍 检查更新'}
        </button>
      </div>

      {versionMsg && (
        <div className="version-check-result">
          {versionMsg}
          {versionInfo && isNewer(versionInfo.version, LOCAL_VERSION) && versionInfo.downloads?.length > 0 && (
            <div className="version-download-list">
              {versionInfo.downloads.map((f: any, i: number) => (
                <a
                  key={i}
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="version-download-btn"
                >
                  ⬇ {f.label || f.name}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="version-timeline">
        {versions.map((v, i) => (
          <div key={v.version} className="version-card">
            <div className="version-header">
              <span className="version-badge">v{v.version}</span>
              <span className="version-date">{v.date}</span>
              {i === 0 && <span className="version-latest">最新版本</span>}
            </div>
            <ul className="version-changes">
              {v.changes.map((change, j) => (
                <li key={j}>{change}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
