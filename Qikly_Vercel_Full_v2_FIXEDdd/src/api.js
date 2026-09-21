const request = async (url, options = {}) => {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  })
  const type = res.headers.get('content-type') || ''
  const data = type.includes('application/json') ? await res.json() : await res.text()
  if (!res.ok) throw new Error(data?.error || data?.message || 'Something went wrong')
  return data
}

export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body || {}) }),
  put: (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body || {}) }),
  del: (url, body) => request(url, { method: 'DELETE', body: JSON.stringify(body || {}) }),
  raw: request,
}
