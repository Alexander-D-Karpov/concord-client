export function getFileBaseUrl(serverAddress: string): string {
    let addr = serverAddress.trim();
    if (addr.startsWith('https://')) {
        const host = addr.replace('https://', '').replace(/\/+$/, '').split(':')[0];
        return `https://${host}`;
    }
    if (addr.startsWith('http://')) {
        const host = addr.replace('http://', '').replace(/\/+$/, '').split(':')[0];
        return `http://${host}:8080`;
    }
    const host = addr.split(':')[0] || 'localhost';
    return `http://${host}:8080`;
}

export function resolveUrl(url: string | undefined, serverAddress: string): string | undefined {
    if (!url) return undefined;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    const base = getFileBaseUrl(serverAddress);
    const clean = url.startsWith('/') ? url : `/${url}`;
    return `${base}${clean}`;
}

export function getApiBaseUrl(serverAddress: string): string {
    const addr = serverAddress.trim().replace(/\/+$/, '');

    if (addr.startsWith('https://') || addr.startsWith('http://')) {
        return addr;
    }

    return `http://${addr}`;
}

export function resolveApiUrl(path: string, serverAddress: string): string {
    const base = getApiBaseUrl(serverAddress);
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
}