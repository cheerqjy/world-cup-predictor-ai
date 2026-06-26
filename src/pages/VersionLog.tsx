import versions from '../data/versions.json'

export function VersionLog() {
  return (
    <div className="page">
      <div className="page-header">
        <h1>📋 版本更新记录</h1>
        <p className="page-subtitle">系统版本迭代与功能更新日志</p>
      </div>

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

      <div className="version-footer">
        <p>当前版本: v{versions[0]?.version || '1.0.0'}</p>
      </div>
    </div>
  )
}
