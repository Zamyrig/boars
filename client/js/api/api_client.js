async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(endpoint, {
            ...options,
            headers: {'Content-Type': 'application/json', ...(options.headers || {})}
        });
        return await res.json();
    } catch (e) {
        return null;
    }
}

export { apiFetch };