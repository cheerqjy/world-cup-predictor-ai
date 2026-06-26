import { useVersionCheck } from '../hooks/useVersionCheck'

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function VersionBanner() {
  const { hasUpdate, latestVersion, dismiss, localVersion } = useVersionCheck()

  if (!hasUpdate || !latestVersion) return null

  const portableFile = latestVersion.downloads?.find(f => f.name.includes('Portable'))
  const setupFile = latestVersion.downloads?.find(f => f.name.includes('Setup'))

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'linear-gradient(135deg, #1a2332 0%, #0f172a 100%)',
      border: '1px solid var(--accent)',
      borderRadius: 12,
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      zIndex: 1000,
      boxShadow: '0 8px 32px rgba(245,158,11,0.2)',
      maxWidth: '90vw',
      minWidth: 280,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20 }}>🔄</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>发现新版本</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: 2 }}>
            {localVersion} → {latestVersion.version}
          </div>
        </div>
        <button
          onClick={dismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text2)',
            cursor: 'pointer',
            fontSize: 16,
            padding: 4,
          }}
        >
          ✕
        </button>
      </div>
      
      {latestVersion.downloads && latestVersion.downloads.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {portableFile && (
            <a
              href={portableFile.url}
              download
              style={{
                flex: 1,
                minWidth: 120,
                padding: '8px 12px',
                background: 'var(--accent)',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'none',
                textAlign: 'center',
              }}
            >
              ⬇ 便携版 ({formatSize(portableFile.size)})
            </a>
          )}
          {setupFile && (
            <a
              href={setupFile.url}
              download
              style={{
                flex: 1,
                minWidth: 120,
                padding: '8px 12px',
                background: 'transparent',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
                borderRadius: 6,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'none',
                textAlign: 'center',
              }}
            >
              ⬇ 安装版 ({formatSize(setupFile.size)})
            </a>
          )}
        </div>
      )}
    </div>
  )
}
