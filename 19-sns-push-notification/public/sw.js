/// <reference lib="webworker" />

const typedSelf = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

typedSelf.addEventListener('push', function (_event) {
    const event = /** @type {PushEvent} event */ (_event);

    const data = event.data ? event.data.json() : null;

    if (!data) console.warn('sw notification without data');

    event.waitUntil(
        typedSelf.registration.showNotification('Notification arrived!', {
            body: 'Lorem ipsum',
            data,
        }),
    );
});

typedSelf.addEventListener('notificationclick', function (_event) {
    const event = /** @type {NotificationEvent} event */ (_event);

    console.log('typedSelf.location.origin', typedSelf.location.origin);
    console.log('event.notification.data', event.notification.data);

    const url = `${typedSelf.location.origin}?${encodeURIComponent(
        toQuery(event.notification.data || {}),
    )}`;

    typedSelf.clients.openWindow(url);
});

function toQuery(obj) {
    return Object.keys(obj)
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`)
        .join('&');
}
