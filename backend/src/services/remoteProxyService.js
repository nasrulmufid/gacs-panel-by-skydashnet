import http from 'node:http';
import https from 'node:https';
import jwt from 'jsonwebtoken';
import Setting from '../models/Setting.js';
import DeviceProfile from '../models/DeviceProfile.js';
import DeviceService from './deviceService.js';

const RESERVED_SUBDOMAINS = new Set(['www', 'panel', 'portal', 'acs', 'cwmp', 'nbi', 'fs', 'api', 'admin', 'mail', 'ns1', 'ns2']);
const RESERVED_SUBDOMAIN_PREFIXES = ['panel-', 'portal-', 'acs-', 'cwmp-', 'nbi-', 'fs-'];

function detectInstanceName() {
  const explicit = String(process.env.INSTANCE_NAME || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (explicit) return explicit;
  const cors = String(process.env.CORS_ORIGINS || '');
  const match = cors.match(/\/\/panel-([a-z0-9_-]+)\./i);
  return match ? match[1].toLowerCase() : '';
}

const INSTANCE_NAME = detectInstanceName();

function isReservedSubdomain(sub) {
  if (!sub) return true;
  const lower = String(sub).toLowerCase();
  if (RESERVED_SUBDOMAINS.has(lower)) return true;
  return RESERVED_SUBDOMAIN_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function stripInstanceSuffix(sub, instanceName = INSTANCE_NAME) {
  if (!sub || !instanceName) return sub;
  const suffix = `-${instanceName.toLowerCase()}`;
  if (sub.toLowerCase().endsWith(suffix) && sub.length > suffix.length) {
    return sub.slice(0, -suffix.length);
  }
  return sub;
}
const COOKIE_NAME = '__sgp_remote_session';
const QUERY_PARAM = '__sgp_rt';

const JWT_SECRET = process.env.JWT_SECRET || 'insecure-development-secret';

function parseCookies(cookieHeader) {
  const result = {};
  if (!cookieHeader) return result;
  for (const part of String(cookieHeader).split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

class RemoteProxyService {
  static settingsCache = {
    data: null,
    expiresAt: 0
  };

  static targetCache = new Map();

  static invalidateSettingsCache() {
    this.settingsCache.expiresAt = 0;
  }

  static invalidateTargetCache(subdomain) {
    if (subdomain) {
      this.targetCache.delete(String(subdomain).toUpperCase());
    } else {
      this.targetCache.clear();
    }
  }

  static async getProxySettings() {
    const now = Date.now();
    if (this.settingsCache.data && now < this.settingsCache.expiresAt) {
      return this.settingsCache.data;
    }
    const all = await Setting.getAll();
    const config = {
      enabled: all.remoteProxyEnabled === 'true',
      baseDomain: String(all.remoteProxyBaseDomain || '').trim().toLowerCase().replace(/^\*\./, ''),
      scheme: all.remoteProxyScheme === 'http' ? 'http' : 'https',
      defaultPort: Number(all.remoteProxyDefaultPort) || 80,
      authMode: all.remoteProxyAuthMode === 'none' ? 'none' : 'token',
      vpIpTr069: all.vpIpTr069 || 'VirtualParameters.IPTR069'
    };
    this.settingsCache = {
      data: config,
      expiresAt: now + 8_000
    };
    return config;
  }

  static sanitizeSubdomainLabel(raw) {
    const cleaned = String(raw || '').trim().replace(/[^A-Za-z0-9-]/g, '');
    return cleaned || null;
  }

  static isSafeTargetIp(ip, port) {
    const validIp = DeviceService.extractIpv4(ip);
    if (!validIp || validIp !== String(ip).trim()) return false;
    const octets = validIp.split('.').map(Number);
    if (octets[0] === 0 || octets[0] === 127 || octets[0] >= 224) return false;
    if (octets[0] === 169 && octets[1] === 254) return false;
    const portNum = Number(port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) return false;
    if ([5890, 5891, 7557, 7547, 3306].includes(portNum)) return false;
    return true;
  }

  static generateTicket({ subdomain, deviceId, targetIp, port = 80, protocol = 'http', username = 'operator' }) {
    return jwt.sign(
      {
        sub: String(subdomain).toUpperCase(),
        deviceId,
        targetIp,
        port: Number(port) || 80,
        protocol: protocol === 'https' ? 'https' : 'http',
        operator: username
      },
      JWT_SECRET,
      {
        issuer: 'skygenpanel-remote',
        audience: 'skygenpanel-remote-proxy',
        expiresIn: '8h'
      }
    );
  }

  static verifyTicket(token, expectedSubdomain) {
    if (!token) return null;
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: 'skygenpanel-remote',
        audience: 'skygenpanel-remote-proxy'
      });
      if (!decoded || typeof decoded !== 'object') return null;
      if (expectedSubdomain && String(decoded.sub).toUpperCase() !== String(expectedSubdomain).toUpperCase()) {
        return null;
      }
      return decoded;
    } catch {
      return null;
    }
  }

  static extractSubdomainFromHost(rawHost, baseDomain) {
    if (!rawHost) return null;
    const hostWithPort = String(rawHost).split(',')[0].trim().toLowerCase();
    const hostname = hostWithPort.replace(/:\d+$/, '');

    // Support <serial>.localhost for local testing
    if (hostname.endsWith('.localhost')) {
      const sub = hostname.slice(0, -'.localhost'.length);
      if (sub && !sub.includes('.') && !isReservedSubdomain(sub)) {
        return stripInstanceSuffix(sub);
      }
    }

    if (!baseDomain) return null;
    const baseHostname = baseDomain.replace(/:\d+$/, '').toLowerCase();
    const suffix = `.${baseHostname}`;
    if (!hostname.endsWith(suffix)) return null;

  const sub = hostname.slice(0, -suffix.length);
  if(!sub || sub.includes('.') || isReservedSubdomain(sub)) {
  return null;
}
return stripInstanceSuffix(sub);
  }

  static resolveInstanceSuffix(requestHost, baseDomain) {
  if (INSTANCE_NAME) return `-${INSTANCE_NAME}`;
  if (!requestHost || !baseDomain) return '';
  const hostClean = String(requestHost).split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  const baseClean = String(baseDomain).trim().toLowerCase().replace(/:\d+$/, '');
  const suffix = `.${baseClean}`;
  if (hostClean.startsWith('panel-') && hostClean.endsWith(suffix)) {
    const inst = hostClean.slice('panel-'.length, -suffix.length);
    if (inst && !inst.includes('.')) return `-${inst}`;
  }
  return '';
}

  static buildRemoteUrl({ serialOrId, baseDomain, scheme, requestHost, ticket, authMode }) {
  const subdomain = this.sanitizeSubdomainLabel(serialOrId);
  if (!subdomain) return null;

  const instanceSuffix = this.resolveInstanceSuffix(requestHost, baseDomain);
  const hostLabel = `${subdomain}${instanceSuffix}`;

  let targetHost;
  let targetScheme = scheme || 'https';
  if (baseDomain) {
    targetHost = `${hostLabel}.${baseDomain}`;
  } else if (requestHost) {
    const portPart = String(requestHost).includes(':') ? `:${String(requestHost).split(':')[1]}` : '';
    targetHost = `${hostLabel}.localhost${portPart}`;
    targetScheme = 'http';
  } else {
    return null;
  }

  const baseUrl = `${targetScheme}://${targetHost}`;
  if (authMode === 'token' && ticket) {
    return `${baseUrl}/?${QUERY_PARAM}=${encodeURIComponent(ticket)}`;
  }
  return baseUrl;
}

  static async resolveDeviceTargetBySubdomain(subdomain) {
  const key = String(subdomain).toUpperCase();
  const now = Date.now();
  const cached = this.targetCache.get(key);
  if (cached && now < cached.expiresAt) {
    return cached.value;
  }

  const devices = await DeviceService.getDevices();
  const matched = devices.find((dev) => {
    const sn = this.sanitizeSubdomainLabel(dev.SerialNumber);
    const idLabel = this.sanitizeSubdomainLabel(dev._id);
    return (sn && sn.toUpperCase() === key) || (idLabel && idLabel.toUpperCase() === key);
  });

  if (!matched) {
    return null;
  }

  const profile = await DeviceProfile.getByDeviceId(matched._id);
  const settings = await this.getProxySettings();

  const targetIp = DeviceService.extractIpv4(profile?.remote_ip_override) || matched.ipTr069;
  const port = Number(profile?.remote_port) || settings.defaultPort || 80;
  const protocol = profile?.remote_protocol === 'https' ? 'https' : 'http';

  if (!targetIp || !this.isSafeTargetIp(targetIp, port)) {
    return null;
  }

  const value = {
    deviceId: matched._id,
    serialNumber: matched.SerialNumber || matched._id,
    targetIp,
    port,
    protocol
  };

  this.targetCache.set(key, {
    value,
    expiresAt: now + 60_000
  });

  return value;
}

  static renderErrorPage(res, status, title, message) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(`<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · SkyGenPanel Remote Proxy</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #09090b; color: #fafafa; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 1.5rem; }
    .card { max-width: 28rem; width: 100%; background: #18181b; border: 1px solid #27272a; border-radius: 0.75rem; padding: 1.75rem; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
    .badge { display: inline-block; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #38bdf8; background: rgba(56,189,248,0.12); padding: 0.25rem 0.6rem; border-radius: 0.375rem; }
    h1 { margin: 0.75rem 0 0.5rem; font-size: 1.25rem; }
    p { margin: 0; color: #a1a1aa; font-size: 0.9rem; line-height: 1.6; }
    code { font-family: monospace; color: #e4e4e7; background: #27272a; padding: 0.15rem 0.35rem; border-radius: 0.25rem; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">SkyGenPanel Remote Proxy</span>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`);
}

  static createMiddleware() {
  return async (req, res, next) => {
    try {
      const rawHost = req.headers['x-forwarded-host'] || req.headers.host;
      const settings = await this.getProxySettings();
      const subdomain = this.extractSubdomainFromHost(rawHost, settings.baseDomain);

      if (!subdomain) {
        return next();
      }

      if (!settings.enabled) {
        return this.renderErrorPage(
          res,
          503,
          'Remote Device Proxy Nonaktif',
          'Fitur Remote Device Proxy sedang dinonaktifkan di pengaturan SkyGenPanel.'
        );
      }

      // Check query parameter ticket handshake (?__sgp_rt=<token>)
      const parsedUrl = new URL(req.originalUrl || req.url, `http://${rawHost}`);
      const incomingTicket = parsedUrl.searchParams.get(QUERY_PARAM);
      if (incomingTicket) {
        const verified = this.verifyTicket(incomingTicket, subdomain);
        if (!verified) {
          return this.renderErrorPage(
            res,
            403,
            'Token Remote Tidak Valid atau Kedaluwarsa',
            'Silakan buka ulang sesi Remote Device dari halaman SkyGenPanel.'
          );
        }
        if (this.isSafeTargetIp(verified.targetIp, verified.port)) {
          this.targetCache.set(String(subdomain).toUpperCase(), {
            value: {
              deviceId: verified.deviceId,
              serialNumber: subdomain.toUpperCase(),
              targetIp: verified.targetIp,
              port: Number(verified.port) || 80,
              protocol: verified.protocol === 'https' ? 'https' : 'http'
            },
            expiresAt: Date.now() + 8 * 3600_000
          });
        }
        parsedUrl.searchParams.delete(QUERY_PARAM);
        const cleanPath = `${parsedUrl.pathname}${parsedUrl.search}`;
        res.setHeader(
          'Set-Cookie',
          `${COOKIE_NAME}=${encodeURIComponent(incomingTicket)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`
        );
        return res.redirect(302, cleanPath || '/');
      }

      let ticketPayload = null;
      if (settings.authMode === 'token') {
        const cookies = parseCookies(req.headers.cookie);
        const sessionToken = cookies[COOKIE_NAME];
        ticketPayload = this.verifyTicket(sessionToken, subdomain);
        if (!ticketPayload) {
          return this.renderErrorPage(
            res,
            403,
            'Akses Remote Memerlukan Sesi Operator',
            'Subdomain perangkat ini dilindungi. Buka SkyGenPanel lalu klik tombol "Remote Device" pada perangkat untuk memulai sesi.'
          );
        }
      }

      let target = null;
      if (ticketPayload && this.isSafeTargetIp(ticketPayload.targetIp, ticketPayload.port)) {
        target = {
          deviceId: ticketPayload.deviceId,
          serialNumber: subdomain.toUpperCase(),
          targetIp: ticketPayload.targetIp,
          port: Number(ticketPayload.port) || 80,
          protocol: ticketPayload.protocol === 'https' ? 'https' : 'http'
        };
      } else {
        target = await this.resolveDeviceTargetBySubdomain(subdomain);
      }

      if (!target || !this.isSafeTargetIp(target.targetIp, target.port)) {
        return this.renderErrorPage(
          res,
          404,
          `Target IP TR-069 Tidak Ditemukan (${subdomain.toUpperCase()})`,
          'Perangkat belum melaporkan IP TR-069 / WAN yang valid ke GenieACS.'
        );
      }

      return this.proxyToDevice(req, res, target, rawHost);
    } catch (error) {
      console.error('Remote proxy error:', error);
      return this.renderErrorPage(
        res,
        502,
        'Gagal Menghubungi Perangkat',
        error instanceof Error ? error.message : 'Terjadi kesalahan pada layanan reverse proxy.'
      );
    }
  };
}

  static proxyToDevice(req, res, target, publicHost) {
  const upstreamOrigin = `${target.protocol}://${target.targetIp}${(target.protocol === 'http' && target.port === 80) || (target.protocol === 'https' && target.port === 443)
    ? ''
    : `:${target.port}`
    }`;
  const upstreamHostHeader =
    (target.protocol === 'http' && target.port === 80) || (target.protocol === 'https' && target.port === 443)
      ? target.targetIp
      : `${target.targetIp}:${target.port}`;

  const forwardedHeaders = { ...req.headers };
  delete forwardedHeaders['x-forwarded-host'];
  delete forwardedHeaders['x-forwarded-proto'];
  delete forwardedHeaders['x-forwarded-for'];
  delete forwardedHeaders['sec-fetch-site'];
  delete forwardedHeaders['sec-fetch-mode'];
  delete forwardedHeaders['sec-fetch-dest'];
  delete forwardedHeaders['sec-fetch-user'];
  forwardedHeaders.host = upstreamHostHeader;

  // Strip internal __sgp_remote_session cookie before sending to ONT
  if (forwardedHeaders.cookie) {
    const filteredCookies = String(forwardedHeaders.cookie)
      .split(';')
      .map((c) => c.trim())
      .filter((c) => !c.startsWith(`${COOKIE_NAME}=`));
    if (filteredCookies.length) {
      forwardedHeaders.cookie = filteredCookies.join('; ');
    } else {
      delete forwardedHeaders.cookie;
    }
  }

  // Rewrite Origin & Referer so ONT web UI CSRF checks pass
  if (forwardedHeaders.origin) {
    forwardedHeaders.origin = upstreamOrigin;
  }
  if (forwardedHeaders.referer) {
    try {
      const refUrl = new URL(forwardedHeaders.referer);
      forwardedHeaders.referer = `${upstreamOrigin}${refUrl.pathname}${refUrl.search}`;
    } catch {
      forwardedHeaders.referer = `${upstreamOrigin}/`;
    }
  }

  const transport = target.protocol === 'https' ? https : http;
  const options = {
    hostname: target.targetIp,
    port: target.port,
    path: req.originalUrl || req.url || '/',
    method: req.method,
    headers: forwardedHeaders,
    timeout: 15_000,
    ...(target.protocol === 'https' ? { rejectUnauthorized: false } : {})
  };

  const proxyReq = transport.request(options, (proxyRes) => {
    const responseHeaders = { ...proxyRes.headers };
    delete responseHeaders['x-frame-options'];
    delete responseHeaders['content-security-policy'];
    delete responseHeaders['content-security-policy-report-only'];

    // Rewrite Location header if ONT redirects to its private IP
    if (responseHeaders.location) {
      const loc = String(responseHeaders.location);
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const publicOrigin = `${proto}://${publicHost}`;
      responseHeaders.location = loc
        .replace(`http://${target.targetIp}:${target.port}`, publicOrigin)
        .replace(`https://${target.targetIp}:${target.port}`, publicOrigin)
        .replace(`http://${target.targetIp}`, publicOrigin)
        .replace(`https://${target.targetIp}`, publicOrigin);
    }

    // Normalize Set-Cookie from ONT so browser stores it on the subdomain
    if (responseHeaders['set-cookie']) {
      const rawCookies = Array.isArray(responseHeaders['set-cookie'])
        ? responseHeaders['set-cookie']
        : [String(responseHeaders['set-cookie'])];
      responseHeaders['set-cookie'] = rawCookies.map((cookieStr) =>
        cookieStr
          .replace(/;\s*Domain=[^;]+/gi, '')
          .replace(/;\s*Secure/gi, '')
      );
    }

    res.writeHead(proxyRes.statusCode || 200, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy(new Error(`Connection timed out to ${target.targetIp}:${target.port}`));
  });

  proxyReq.on('error', (err) => {
    if (res.headersSent) {
      return res.end();
    }
    return this.renderErrorPage(
      res,
      502,
      `ONT Web UI Tidak Merespons (${target.targetIp}:${target.port})`,
      `Pastikan ONT online, rute jaringan TR-069 dari server SkyGenPanel ke ${target.targetIp}:${target.port} terbuka, dan HTTP WAN Access pada ONT aktif. (${err.message})`
    );
  });

  req.pipe(proxyReq);
}
}

export default RemoteProxyService;
