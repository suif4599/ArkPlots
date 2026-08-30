;(function () {
  'use strict'

  var PLOTLINE = window.__ARKPLOTS_PLOTLINE__
  var STORAGE_KEY = 'arkplots.records'
  var DEFAULT_STATUS = '未读'

  if (
    !PLOTLINE ||
    typeof window.fetch !== 'function' ||
    typeof Response === 'undefined' ||
    typeof Promise === 'undefined'
  ) {
    // Missing build data or unsupported browser: leave fetch untouched.
    if (typeof console !== 'undefined' && console.error) {
      console.error('[ArkPlots] static API shim disabled: build data or browser support missing')
    }
    return
  }

  var plots = Array.isArray(PLOTLINE.data) ? PLOTLINE.data : []

  function jsonResponse(status, payload) {
    return new Response(JSON.stringify(payload), {
      status: status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }

  function loadStoredRecords() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      var parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      return parsed
    } catch (err) {
      return null // unreadable or corrupt storage behaves like "no records yet"
    }
  }

  function seededRecords() {
    var stored = loadStoredRecords()
    var records = Object.create(null)
    if (stored) {
      Object.keys(stored).forEach(function (key) {
        records[String(key)] = String(stored[key])
      })
    }
    plots.forEach(function (plot) {
      if (!plot || plot.id === null || plot.id === undefined) return
      var key = String(plot.id)
      if (!(key in records)) records[key] = DEFAULT_STATUS
    })
    return records
  }

  function saveRecords(body) {
    var clean = Object.create(null)
    Object.keys(body).forEach(function (key) {
      clean[String(key)] = String(body[key])
    })
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean))
    } catch (err) {
      // Quota exceeded / private mode: keep the session working instead of
      // surfacing an error banner on every status change.
    }
    return clean
  }

  function requestPath(input) {
    var url = ''
    if (typeof input === 'string') url = input
    else if (input && typeof input.url === 'string') url = input.url // Request objects
    if (!url) return ''
    var path = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
    return path.split('?')[0].split('#')[0]
  }

  function requestMethod(input, init) {
    var method = (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET'
    return String(method).toUpperCase()
  }

  var originalFetch = window.fetch.bind(window)

  window.fetch = function (input, init) {
    var path = requestPath(input)
    var method = requestMethod(input, init)

    if (path === '/api/plots' && method === 'GET') {
      return Promise.resolve(jsonResponse(200, PLOTLINE))
    }

    if (path === '/api/records') {
      if (method === 'GET') {
        return Promise.resolve(jsonResponse(200, seededRecords()))
      }
      if (method === 'PUT') {
        var body = null
        try {
          var raw = init && init.body
          body = typeof raw === 'string' ? JSON.parse(raw) : raw
        } catch (err) {
          body = null
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return Promise.resolve(jsonResponse(400, { error: 'body must be a JSON object' }))
        }
        return Promise.resolve(jsonResponse(200, saveRecords(body)))
      }
    }

    return originalFetch(input, init)
  }
})()
