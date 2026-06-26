const BASE = '/api'

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || '请求失败')
  }
  return res.json()
}

export const api = {
  matches: {
    list(params?: Record<string, string>) {
      const q = params ? '?' + new URLSearchParams(params) : ''
      return request(`/matches${q}`)
    },
    get(id: number) {
      return request(`/matches/${id}`)
    },
    submitResult(id: number, data: { home_score: number; away_score: number; half_home_score: number; half_away_score: number }) {
      return request(`/matches/${id}/result`, { method: 'PUT', body: JSON.stringify(data) })
    },
    predictions(id: number) {
      return request(`/matches/${id}/predictions`)
    },
  },
  predictions: {
    predict(matchId: number) {
      return request(`/predictions/predict/${matchId}`, { method: 'POST' })
    },
    list() {
      return request('/predictions')
    },
    compare() {
      return request('/predictions/compare')
    },
    getConfig() {
      return request('/predictions/config')
    },
    updateConfig(data: { provider?: string; api_key?: string; model?: string; base_url?: string }) {
      return request('/predictions/config', { method: 'PUT', body: JSON.stringify(data) })
    },
    delete(id: number) {
      return request(`/predictions/${id}`, { method: 'DELETE' })
    },
  },
  champion: {
    predict() {
      return request('/champion', { method: 'POST' })
    },
    list() {
      return request('/champion')
    },
    stats() {
      return request('/champion/stats')
    },
  },
  recommendations: {
    list() {
      return request('/recommendations')
    },
  },
}
