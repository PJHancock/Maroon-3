import { registerScreen, openSheet, closeSheet, getState, refreshState } from "./app_b.js";

let notifications = [
    { title: "Follow Up", body: "It's been 3 days since you met Alice. Time to follow up!", time: "2m ago", icon: "👥" },
    { title: "New Event", body: "Tech Mixer is happening tomorrow at 6 PM.", time: "1h ago", icon: "🎉" }
];

let settings = typeof localStorage !== 'undefined' 
    ? JSON.parse(localStorage.getItem('notificationSettings') || '{"followUpDays": 3, "meetPeopleFrequency": "weekly", "eventsEnabled": true}')
    : { followUpDays: 3, meetPeopleFrequency: "weekly", eventsEnabled: true };

function saveSettings(newSettings) {
    settings = { ...settings, ...newSettings };
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('notificationSettings', JSON.stringify(settings));
    }
}

function renderNotificationsList() {
    let list = [...notifications];
    
    if (settings.eventsEnabled) {
        const state = getState();
        if (state && state.tasks) {
            const eventTasks = state.tasks.filter(t => t.type === 'event' || t.prep_context?.kind === 'event');
            eventTasks.forEach(task => {
                const title = task.prep_context?.title || task.title;
                const body = task.prep_context?.summary || "You have an event coming up. Tap here to prepare.";
                const time = task.prep_context?.starts_at ? new Date(task.prep_context.starts_at).toLocaleDateString() : "Upcoming";
                if (!list.find(n => n.title === title)) {
                    list.push({ title, body, time, icon: "🎉", isDynamic: true });
                }
            });
        }
    }

    if (list.length === 0) {
        return `<div class="empty">No notifications right now.</div>`;
    }
    return list.map((n, i) => `
        <div class="card" style="display: flex; gap: 12px; align-items: flex-start; margin-bottom: 10px; position: relative;">
            <div style="font-size: 24px;">${n.icon}</div>
            <div style="flex: 1; padding-right: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <strong>${n.title}</strong>
                    <span style="font-size: 12px; color: var(--text-light);">${n.time}</span>
                </div>
                <div style="font-size: 14px; color: var(--text-light);">${n.body}</div>
            </div>
            ${n.isDynamic ? '' : `<button class="btn-dismiss" data-index="${i}" style="position: absolute; top: 8px; right: 8px; background: none; border: none; font-size: 18px; line-height: 1; cursor: pointer; color: var(--text-light); padding: 0;" aria-label="Dismiss">&times;</button>`}
        </div>
    `).join('');
}

function openSettings() {
    openSheet(`
        <h2>Notification Settings</h2>
        <div class="field" style="margin-top: 16px;">
            <label>Follow-up reminder (days after meeting)</label>
            <input type="number" id="notif-follow-up" value="${settings.followUpDays}" style="width: 100%; box-sizing: border-box; padding: 10px; border-radius: 8px; border: 1px solid var(--line);">
        </div>
        <div class="field" style="margin-top: 16px;">
            <label>Meet new people frequency</label>
            <select id="notif-frequency" style="width: 100%; box-sizing: border-box; padding: 10px; border-radius: 8px; border: 1px solid var(--line);">
                <option value="daily" ${settings.meetPeopleFrequency === 'daily' ? 'selected' : ''}>Daily</option>
                <option value="weekly" ${settings.meetPeopleFrequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                <option value="monthly" ${settings.meetPeopleFrequency === 'monthly' ? 'selected' : ''}>Monthly</option>
            </select>
        </div>
        <div class="field" style="margin-top: 16px; display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="notif-events" ${settings.eventsEnabled ? 'checked' : ''}>
            <label for="notif-events" style="margin: 0;">Receive event notifications</label>
        </div>
        <div class="sheet-actions">
            <button class="btn btn-secondary" id="notif-cancel">Cancel</button>
            <button class="btn" id="notif-save">Save</button>
        </div>
    `);

    document.getElementById('notif-cancel').onclick = closeSheet;
    document.getElementById('notif-save').onclick = () => {
        saveSettings({
            followUpDays: parseInt(document.getElementById('notif-follow-up').value) || 3,
            meetPeopleFrequency: document.getElementById('notif-frequency').value,
            eventsEnabled: document.getElementById('notif-events').checked
        });
        closeSheet();
        const listEl = document.getElementById('notifications-list');
        if (listEl) listEl.innerHTML = renderNotificationsList();
    };
}

function triggerNotification(el) {
    const newNotif = {
        title: "Demo Notification",
        body: "This is a triggered notification based on your settings.",
        time: "Just now",
        icon: "🔔"
    };
    
    if ("Notification" in window) {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                new Notification(newNotif.title, { body: newNotif.body });
            }
        });
    }

    notifications.unshift(newNotif);
    
    const listEl = el.querySelector('#notifications-list');
    if (listEl) {
        listEl.innerHTML = renderNotificationsList();
    }
}


registerScreen("notifications", {
    async show({ el }) {
        if (!getState()) await refreshState();

        el.innerHTML = `
            <header class="block-head">
                <h1>Notifications</h1>
                <button class="icon-btn" id="btn-notif-settings" aria-label="Notification settings" title="Notification settings">⚙️</button>
            </header>

            <div>
                <button class="btn" id="btn-trigger-notif" style="width: 100%; margin-bottom: 20px;">Get Notifications (Demo)</button>
                
                <div id="notifications-list">
                    ${renderNotificationsList()}
                </div>
            </div>
        `;

        el.querySelector('#btn-notif-settings').onclick = openSettings;
        el.querySelector('#btn-trigger-notif').onclick = () => triggerNotification(el);
        
        el.querySelector('#notifications-list').addEventListener('click', (e) => {
            const dismissBtn = e.target.closest('.btn-dismiss');
            if (dismissBtn) {
                const index = parseInt(dismissBtn.getAttribute('data-index'), 10);
                notifications.splice(index, 1);
                el.querySelector('#notifications-list').innerHTML = renderNotificationsList();
            }
        });
    }
});
