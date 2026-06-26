import { useState, useEffect } from 'react'
import { api } from '../api'

export function Settings() {
  const [config, setConfig] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    provider: 'openai',
    api_key: '',
    model: 'gpt-4o',
    base_url: '',
  })
  const [message, setMessage] = useState('')

  useEffect(() => {
    api.predictions.getConfig().then(c => {
      setConfig(c)
      setForm(f => ({ ...f, provider: c.provider, model: c.model, base_url: c.base_url || '' }))
    })
  }, [])

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      await api.predictions.updateConfig(form)
      setMessage('✅ 保存成功！')
      setConfig({ ...config, has_key: !!form.api_key })
    } catch {
      setMessage('❌ 保存失败')
    }
    setSaving(false)
  }

  const PROVIDERS = [
    { value: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1' },
    { value: 'deepseek', label: 'DeepSeek', url: 'https://api.deepseek.com' },
    { value: 'moonshot', label: '月之暗面(Kimi)', url: 'https://api.moonshot.cn/v1' },
    { value: 'custom', label: '自定义', url: '' },
  ]

  return (
    <div className="page settings-page">
      <h2 className="section-title">⚙️ AI模型配置</h2>
      <p className="settings-desc">
        配置AI大模型API密钥，用于预测比赛结果。支持OpenAI及兼容接口。不配置则使用统计模型。
      </p>

      <div className="settings-card">
        <div className="form-group">
          <label>AI提供商</label>
          <select value={form.provider} onChange={e => {
            const p = PROVIDERS.find(x => x.value === e.target.value)
            setForm(f => ({ ...f, provider: e.target.value, base_url: p?.url || '' }))
          }}>
            {PROVIDERS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>API密钥</label>
          <input
            type="password"
            placeholder="sk-..."
            value={form.api_key}
            onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
          />
          {config?.has_key && <span className="key-status has-key">✅ 已配置</span>}
        </div>

        <div className="form-group">
          <label>模型名称</label>
          <input
            type="text"
            value={form.model}
            placeholder="gpt-4o / deepseek-chat"
            onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
          />
          <span className="form-hint">如: gpt-4o, deepseek-chat, moonshot-v1-8k</span>
        </div>

        <div className="form-group">
          <label>API地址 (可选)</label>
          <input
            type="text"
            value={form.base_url}
            placeholder="https://api.openai.com/v1"
            onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
          />
        </div>

        {message && <div className="form-message">{message}</div>}

        <button className="btn-save" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '💾 保存配置'}
        </button>
      </div>

      <div className="settings-info">
        <h3>📖 使用说明</h3>
        <ul>
          <li><strong>OpenAI</strong> - 使用GPT-4o等模型，需要OpenAI API Key</li>
          <li><strong>DeepSeek</strong> - 国产大模型，性价比高，需在 platform.deepseek.com 获取API Key</li>
          <li><strong>月之暗面(Kimi)</strong> - 国产大模型，支持超长上下文</li>
          <li><strong>自定义</strong> - 可接入任何兼容OpenAI接口的模型（如Ollama本地部署）</li>
          <li><strong>不配置API Key</strong> - 系统将使用FIFA排名统计模型进行预测</li>
        </ul>
      </div>
    </div>
  )
}
