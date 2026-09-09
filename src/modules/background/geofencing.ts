export async function configureGeofencing(_owner: string, enabled: boolean, _request = false) { if (enabled) throw new Error('Campus geofencing requires the iOS or Android app.'); }
export async function stopGeofencing() {}
