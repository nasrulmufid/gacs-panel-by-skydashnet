import DeviceService from '../services/deviceService.js';
import CustomerService from '../services/customerService.js';
import RemoteProxyService from '../services/remoteProxyService.js';
import CustomerAccount from '../models/CustomerAccount.js';
import DeviceProfile from '../models/DeviceProfile.js';
import { createResponse, createErrorResponse } from '../utils/helpers.js';

class DeviceController {
  static async getDashboard(req, res) {
    try {
      const dashboard = await DeviceService.getDashboardData(req.query.refresh === '1');
      return res.json(createResponse('Dashboard data retrieved successfully', dashboard));
    } catch (error) {
      console.error('Get dashboard error:', error);
      return res.status(502).json(
        createErrorResponse('Failed to get dashboard data from GenieACS', error.message)
      );
    }
  }

  static async getFaults(req, res) {
    try {
      const faults = await DeviceService.getFaults(req.query.limit);
      void DeviceService.mergeDashboardFaults(faults);
      return res.json(createResponse('Faults retrieved successfully', faults));
    } catch (error) {
      console.error('Get faults error:', error);
      return res.status(502).json(
        createErrorResponse('Failed to get faults from GenieACS', error.message)
      );
    }
  }

  static async deleteFault(req, res) {
    try {
      await DeviceService.deleteFault(req.params.faultId);
      DeviceService.dashboardCache.expiresAt = 0;
      return res.json(createResponse('Fault cleared successfully'));
    } catch (error) {
      console.error('Delete fault error:', error);
      const validationError = error.message === 'Invalid fault ID';
      return res.status(validationError ? 400 : 502).json(
        createErrorResponse('Failed to clear GenieACS fault', error.message)
      );
    }
  }

  static async getDevices(req, res) {
    try {
      const devices = await DeviceService.getDevices();
      const decoratedDevices = await CustomerService.decorateDevices(devices);
      return res.json(
        createResponse('Devices retrieved successfully', decoratedDevices.reverse())
      );
    } catch (error) {
      console.error('Get devices error:', error);
      return res.status(500).json(
        createErrorResponse('Failed to get devices', error.message)
      );
    }
  }

  static async getDeviceDetail(req, res) {
    try {
      const { deviceId } = req.params;
      
      if (!deviceId) {
        return res.status(400).json(
          createErrorResponse('Device ID is required')
        );
      }

      const deviceDetail = await DeviceService.getDetailDevice(deviceId);
      const profile = await DeviceProfile.getByDeviceId(deviceId);
      const proxySettings = await RemoteProxyService.getProxySettings();
      let account = await CustomerAccount.getByDeviceId(deviceId);
      if (!account && await CustomerService.isAutoGenerationEnabled()) {
        account = await CustomerService.ensureAccount({
          _id: deviceId,
          softwareId: deviceDetail.deviceInfo?.softwareVersion,
          pppoe: deviceDetail.virtualParameters?.pppoeUsername?.value
        });
      }
      const subdomainLabel = RemoteProxyService.sanitizeSubdomainLabel(
        deviceDetail.deviceInfo?.serialNumber || deviceId
      );
      const resolvedTargetIp = DeviceService.extractIpv4(profile?.remote_ip_override) || deviceDetail.ipTr069 || null;
      const resolvedPort = Number(profile?.remote_port) || proxySettings.defaultPort || 80;
      const resolvedProtocol = profile?.remote_protocol === 'https' ? 'https' : 'http';
      const rawHost = req.headers['x-forwarded-host'] || req.headers.host;
      const cleanRemoteUrl = RemoteProxyService.buildRemoteUrl({
        serialOrId: subdomainLabel,
        baseDomain: proxySettings.baseDomain,
        scheme: proxySettings.scheme,
        requestHost: rawHost,
        ticket: null,
        authMode: 'none'
      });

      const hasLocation =
        profile?.latitude !== null &&
        profile?.latitude !== undefined &&
        profile?.longitude !== null &&
        profile?.longitude !== undefined &&
        Number.isFinite(Number(profile.latitude)) &&
        Number.isFinite(Number(profile.longitude));

      return res.json(
        createResponse('Device detail retrieved successfully', {
          ...deviceDetail,
          customer: {
            customerId: account?.customer_id || null,
            installationDate: profile?.installation_date || null,
            generated: Boolean(account)
          },
          location: hasLocation
            ? {
                latitude: Number(profile.latitude),
                longitude: Number(profile.longitude)
              }
            : null,
          remoteAccess: {
            enabled: proxySettings.enabled,
            baseDomain: proxySettings.baseDomain,
            scheme: proxySettings.scheme,
            authMode: proxySettings.authMode,
            subdomain: subdomainLabel,
            cleanUrl: cleanRemoteUrl,
            targetIp: resolvedTargetIp,
            ipOverride: profile?.remote_ip_override || null,
            port: resolvedPort,
            protocol: resolvedProtocol
          }
        })
      );
    } catch (error) {
      console.error('Get device detail error:', error);
      
      if (error.message === 'Device not found') {
        return res.status(404).json(
          createErrorResponse('Device not found', error.message)
        );
      }
      
      return res.status(500).json(
        createErrorResponse('Failed to get device detail', error.message)
      );
    }
  }

  static async deleteDevice(req, res) {
    try {
      const { deviceId } = req.params;
      
      if (!deviceId) {
        return res.status(400).json(
          createErrorResponse('Device ID is required')
        );
      }

      await DeviceService.deleteDevice(deviceId);
      return res.json(
        createResponse('Device deleted successfully', { deviceId })
      );
    } catch (error) {
      console.error('Delete device error:', error);
      return res.status(500).json(
        createErrorResponse('Failed to delete device', error.message)
      );
    }
  }

  static async rebootDevice(req, res) {
    try {
      const { deviceId } = req.body;
      
      if (!deviceId) {
        return res.status(400).json(
          createErrorResponse('Device ID is required')
        );
      }

      const result = await DeviceService.rebootDevice(deviceId);
      return res.json(
        createResponse('Device reboot initiated successfully', { 
          deviceId, 
          taskResponse: result 
        })
      );
    } catch (error) {
      console.error('Reboot device error:', error);
      return res.status(500).json(
        createErrorResponse('Failed to reboot device', error.message)
      );
    }
  }

  static async summonDevice(req, res) {
    const { deviceId, parameters = [] } = req.body;

    if (!deviceId) {
      return res.status(400).json(
        createErrorResponse('Device ID is required')
      );
    }

    try {
      const data = await DeviceService.summonDevice(deviceId, parameters);
      return res.json(
        createResponse('Device summon task queued.', data)
      );
    } catch (error) {
      console.error('Error summoning device:', error.message);
      return res.status(500).json(
        createErrorResponse('Failed to summon device', error.message)
      );
    }
  }

  static async updateWanConfig(req, res) {
    const { id } = req.params;
    const { wanIndex, formData } = req.body;
    
    if (!wanIndex || !formData) {
      return res.status(400).json({ success: false, message: 'Missing wanIndex or formData' });
    }

    try {
      const result = await DeviceService.updateWanConfig(id, wanIndex, formData);
      return res.json(createResponse(result.message, result));
    } catch (error) {
      console.error(`Error in updateWanConfig for ${id}:`, error);
      const validationError = /^(Invalid|VLAN ID|PPP |WAN |No editable|Only PPPoE|Vendor not found)/.test(error.message);
      res.status(validationError ? 400 : 500).json(
        createErrorResponse('Failed to update WAN config', error.message)
      );
    }
  }

  static async addWanConnection(req, res) {
    const { id } = req.params;
    const { containerPath, type } = req.body || {};
    if (!containerPath || !type) {
      return res.status(400).json(createErrorResponse('WAN container and connection type are required'));
    }
    try {
      const result = await DeviceService.addWanConnection(id, String(containerPath), String(type));
      DeviceService.dashboardCache.expiresAt = 0;
      return res.json(createResponse(result.message, result));
    } catch (error) {
      console.error(`Error adding WAN connection for ${id}:`, error);
      const validationError = /^(Invalid WAN|Device not found)/.test(error.message);
      return res.status(validationError ? 400 : 502).json(
        createErrorResponse('Failed to add WAN connection', error.message)
      );
    }
  }

  static async updateInstallationDate(req, res) {
    const { id } = req.params;
    const installationDate = CustomerService.normalizeInstallationDate(req.body?.installationDate);
    if (!installationDate) {
      return res.status(400).json(createErrorResponse('Installation date must use YYYY-MM-DD'));
    }
    try {
      const detail = await DeviceService.getDetailDevice(id);
      const previous = await DeviceProfile.getByDeviceId(id);
      const installationTag = await DeviceService.syncInstallationTag(
        id,
        installationDate,
        previous?.installation_tag || null
      );
      const profile = await DeviceProfile.upsertInstallationDate(id, installationDate, installationTag);
      let account = await CustomerAccount.getByDeviceId(id);
      if (!account && await CustomerService.isAutoGenerationEnabled()) {
        account = await CustomerService.ensureAccount({
          _id: id,
          softwareId: detail.deviceInfo?.softwareVersion,
          pppoe: detail.virtualParameters?.pppoeUsername?.value
        });
      }
      return res.json(createResponse('Installation date saved and GenieACS tag synchronized', {
        installationDate: profile.installation_date,
        installationTag,
        customerId: account?.customer_id || null
      }));
    } catch (error) {
      console.error(`Error saving installation date for ${id}:`, error);
      const status = error.message === 'Device not found' ? 404 : 502;
      return res.status(status).json(
        createErrorResponse('Failed to save installation date', error.message)
      );
    }
  }

  static async updateLocation(req, res) {
    const { id } = req.params;
    const { latitude, longitude } = req.body || {};

    if (!id) {
      return res.status(400).json(createErrorResponse('Device ID is required'));
    }

    try {
      if (latitude === null && longitude === null) {
        await DeviceProfile.upsertLocation(id, null, null);
        return res.json(createResponse('Lokasi perangkat dihapus', { location: null }));
      }

      const lat = Number(latitude);
      const lng = Number(longitude);
      if (
        latitude === '' ||
        longitude === '' ||
        latitude === undefined ||
        longitude === undefined ||
        !Number.isFinite(lat) ||
        lat < -90 ||
        lat > 90 ||
        !Number.isFinite(lng) ||
        lng < -180 ||
        lng > 180
      ) {
        return res.status(400).json(
          createErrorResponse('Koordinat latitude (-90..90) dan longitude (-180..180) harus valid')
        );
      }

      const profile = await DeviceProfile.upsertLocation(id, lat, lng);
      return res.json(
        createResponse('Lokasi perangkat berhasil disimpan', {
          location: {
            latitude: Number(profile.latitude),
            longitude: Number(profile.longitude)
          }
        })
      );
    } catch (error) {
      console.error(`Error saving location for ${id}:`, error);
      return res.status(500).json(
        createErrorResponse('Failed to save device location', error.message)
      );
    }
  }

  static async bulkUpdateLocations(req, res) {
    try {
      const items = req.body?.items;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json(
          createErrorResponse('Data CSV kosong atau tidak valid')
        );
      }

      if (items.length > 10000) {
        return res.status(400).json(
          createErrorResponse('Maksimal 10.000 baris koordinat per upload CSV')
        );
      }

      const devices = await DeviceService.getDevices();
      const bySerial = new Map();
      const byId = new Map();
      for (const dev of devices) {
        if (dev.SerialNumber) {
          bySerial.set(String(dev.SerialNumber).trim().toUpperCase(), dev._id);
        }
        if (dev._id) {
          byId.set(String(dev._id).trim().toUpperCase(), dev._id);
        }
      }

      const deduped = new Map();
      const notFoundSet = new Set();
      let invalidCount = 0;

      for (const item of items) {
        const serial = typeof item?.serialNumber === 'string'
          ? item.serialNumber.trim()
          : String(item?.serialNumber ?? '').trim();
        const rawLat = item?.latitude;
        const rawLng = item?.longitude;
        const lat = (rawLat === null || rawLat === undefined || rawLat === '' || typeof rawLat === 'boolean')
          ? Number.NaN
          : Number(rawLat);
        const lng = (rawLng === null || rawLng === undefined || rawLng === '' || typeof rawLng === 'boolean')
          ? Number.NaN
          : Number(rawLng);

        if (
          !serial ||
          !Number.isFinite(lat) || lat < -90 || lat > 90 ||
          !Number.isFinite(lng) || lng < -180 || lng > 180
        ) {
          invalidCount += 1;
          continue;
        }

        const lookupKey = serial.toUpperCase();
        const deviceId = bySerial.get(lookupKey) ?? byId.get(lookupKey);
        if (!deviceId) {
          notFoundSet.add(serial);
          continue;
        }

        deduped.set(deviceId, {
          deviceId,
          latitude: lat,
          longitude: lng
        });
      }

      const entries = Array.from(deduped.values());
      const updated = await DeviceProfile.bulkUpsertLocations(entries);
      const notFound = Array.from(notFoundSet);

      return res.json(
        createResponse(`${updated} koordinat perangkat berhasil diperbarui`, {
          updated,
          notFound,
          invalidCount
        })
      );
    } catch (error) {
      console.error('Error bulk updating device locations:', error);
      return res.status(500).json(
        createErrorResponse('Gagal memperbarui koordinat perangkat secara massal', error.message)
      );
    }
  }

  static async updateCredentials(req, res) {
    const { id } = req.params;
    const { type, password } = req.body;

    if (!type || !password) {
      return res.status(400).json({ success: false, message: 'Missing type or password' });
    }

    try {
      const result = await DeviceService.updateCredentials(id, type, password);
      res.json({ success: true, data: result, message: result.message });
    } catch (error) {
      console.error(`Error in updateCredentials for ${id}:`, error);
      const validationError = /^(Invalid credential|Password must|VirtualParameter path)/.test(error.message);
      res.status(validationError ? 400 : 500).json(
        createErrorResponse('Failed to update credentials', error.message)
      );
    }
  }

  static async updateWifiConfig(req, res) {
    const { id } = req.params;
    const { index, formData } = req.body || {};
    if (index === undefined || !formData) {
      return res.status(400).json(createErrorResponse('WiFi index and form data are required'));
    }
    try {
      const result = await DeviceService.updateWifiConfig(id, index, formData);
      DeviceService.dashboardCache.expiresAt = 0;
      return res.json(createResponse(result.message, result));
    } catch (error) {
      console.error(`Error in updateWifiConfig for ${id}:`, error);
      const validationError = /^(WiFi |Device not found)/.test(error.message);
      return res.status(validationError ? 400 : 500).json(
        createErrorResponse('Failed to update WiFi configuration', error.message)
      );
    }
  }

  static async prepareRemoteSession(req, res) {
    const { id } = req.params;
    const { targetIp, port, protocol, savePreference } = req.body || {};
    if (!id) {
      return res.status(400).json(createErrorResponse('Device ID is required'));
    }

    try {
      const deviceDetail = await DeviceService.getDetailDevice(id);
      const proxySettings = await RemoteProxyService.getProxySettings();
      let profile = await DeviceProfile.getByDeviceId(id);

      if (savePreference || targetIp !== undefined || port !== undefined || protocol !== undefined) {
        const nextOverride = targetIp ? DeviceService.extractIpv4(targetIp) : null;
        if (targetIp && !nextOverride) {
          return res.status(400).json(createErrorResponse('Invalid target IPv4 address'));
        }
        const nextPort = Number(port) || profile?.remote_port || proxySettings.defaultPort || 80;
        const nextProtocol = (protocol || profile?.remote_protocol) === 'https' ? 'https' : 'http';
        profile = await DeviceProfile.upsertRemoteConfig(id, {
          remoteIpOverride: nextOverride,
          remotePort: nextPort,
          remoteProtocol: nextProtocol
        });
      }

      const resolvedIp = DeviceService.extractIpv4(profile?.remote_ip_override) || deviceDetail.ipTr069;
      const resolvedPort = Number(profile?.remote_port) || proxySettings.defaultPort || 80;
      const resolvedProtocol = profile?.remote_protocol === 'https' ? 'https' : 'http';

      if (!resolvedIp || !RemoteProxyService.isSafeTargetIp(resolvedIp, resolvedPort)) {
        return res.status(400).json(
          createErrorResponse('Device does not have a valid TR-069 / WAN IPv4 address yet')
        );
      }

      const subdomain = RemoteProxyService.sanitizeSubdomainLabel(
        deviceDetail.deviceInfo?.serialNumber || id
      );
      if (!subdomain) {
        return res.status(400).json(createErrorResponse('Device serial number cannot form a valid subdomain'));
      }

      RemoteProxyService.invalidateTargetCache(subdomain);

      const ticket = RemoteProxyService.generateTicket({
        subdomain,
        deviceId: id,
        targetIp: resolvedIp,
        port: resolvedPort,
        protocol: resolvedProtocol,
        username: req.user?.username || 'admin'
      });

      const rawHost = req.headers['x-forwarded-host'] || req.headers.host;
      const launchUrl = RemoteProxyService.buildRemoteUrl({
        serialOrId: subdomain,
        baseDomain: proxySettings.baseDomain,
        scheme: proxySettings.scheme,
        requestHost: rawHost,
        ticket,
        authMode: proxySettings.authMode
      });
      const cleanUrl = RemoteProxyService.buildRemoteUrl({
        serialOrId: subdomain,
        baseDomain: proxySettings.baseDomain,
        scheme: proxySettings.scheme,
        requestHost: rawHost,
        ticket: null,
        authMode: 'none'
      });

      return res.json(
        createResponse('Remote session prepared', {
          enabled: proxySettings.enabled,
          subdomain,
          targetIp: resolvedIp,
          port: resolvedPort,
          protocol: resolvedProtocol,
          authMode: proxySettings.authMode,
          url: launchUrl,
          cleanUrl
        })
      );
    } catch (error) {
      console.error(`Error in prepareRemoteSession for ${id}:`, error);
      return res.status(500).json(
        createErrorResponse('Failed to prepare remote session', error.message)
      );
    }
  }
}

export default DeviceController;
