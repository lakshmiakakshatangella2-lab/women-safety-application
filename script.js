const API_BASE_URL = 'http://127.0.0.1:5000';
const originalFetch = window.fetch;
window.fetch = function () {
    let [resource, config] = arguments;
    if (typeof resource === 'string' && resource.startsWith('/api/')) {
        resource = API_BASE_URL + resource;
        if (!config) config = {};
        config.credentials = 'include';
    }
    return originalFetch(resource, config);
};

let currentSlide = 0;
// 📱 Navigation
function showScreen(id) {
    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    let target = document.getElementById(id);
    if (target) target.classList.add("active");

    // App fullscreen toggle for dashboard
    let appContainer = document.querySelector('.app');
    if (id === 'dashboards') {
        appContainer.classList.add('fullscreen-mode');
    } else {
        appContainer.classList.remove('fullscreen-mode');
    }

    // Splash remove
    if (id !== "splash") {
        let splash = document.getElementById("splash");
        if (splash) splash.style.display = "none";
    }

    // Load chart
    if (id === "dashboard") {
        loadChart();
    }

    // Load map
    if (id === "mapScreen") {
        initMap();
    }

    // Load Live Tracking
    if (id === "liveTracking") {
        setTimeout(() => {
            initLiveTrackingMap();
        }, 300); // Slight delay for CSS animation
    }
}

// 📞 Call
function callNumber(num) {
    window.location.href = "tel:" + num;
}

// 🚨 SOS (backend Twilio + local wa.me fallback)
async function sendSOS() {
    let btn = document.getElementById("sosButton");
    if (btn) {
        btn.innerText = "🚨 SENDING...";
        btn.disabled = true;
    }

    let lat = null;
    let lon = null;

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async pos => {
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
            await triggerBackendSOS(lat, lon);
        }, async () => {
            await triggerBackendSOS(null, null); // location denied
        });
    } else {
        await triggerBackendSOS(null, null);
    }
}

async function triggerBackendSOS(lat, lon) {
    let btn = document.getElementById("sosButton");
    try {
        let res = await fetch('/api/sos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: lat, lng: lon })
        });

        let data;
        try {
            data = await res.json();
        } catch (e) {
            throw new Error("Invalid response from server. Is the backend running?");
        }

        if (!res.ok || data.status === 'error') {
            throw new Error(data.message || "Server returned an error");
        }

        // Open local WhatsApp fallback links just in case
        if (data.sent_to && data.sent_to.length > 0) {
            let msg = `🚨 EMERGENCY! I am in danger. Please help me immediately! ${lat ? "Location: https://maps.google.com/?q=" + lat + "," + lon : ""}`;
            data.sent_to.forEach(num => {
                let url = `https://wa.me/${num}?text=` + encodeURIComponent(msg);
                window.open(url, "_blank");
            });
            alert("Success! SOS Dispatched via Backend SMS and WhatsApp.");
        } else {
            alert("SOS Triggered to Backend, but no contacts found.");
        }
    } catch (err) {
        alert("Network Error: " + err.message + "\n\nPlease check if Flask backend is running and reachable.");
    } finally {
        if (btn) {
            btn.innerText = "⚡ SOS NOW";
            btn.disabled = false;
        }
    }
}

// 📍 Location + Police
function shareLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {

            let lat = pos.coords.latitude;
            let lon = pos.coords.longitude;

            let mapLink = `https://maps.google.com/?q=${lat},${lon}`;
            let policeLink = `https://www.google.com/maps/search/police+station+near+me/@${lat},${lon},15z`;

            let msg = "🚨 EMERGENCY! My Location: " + mapLink;

            window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
            window.open(policeLink, "_blank");

        }, () => {
            alert("Location access denied");
        });
    }
}

// 💬 Feedback
async function submitFeedback() {
    let name = document.getElementById("name").value;
    let email = document.getElementById("email").value;
    let msg = document.getElementById("msg").value;

    if (!name || !email || !msg) {
        alert("Please fill all fields");
        return;
    }

    try {
        let res = await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, msg })
        });
        if (res.ok) {
            alert("Feedback Saved to Server!");
            document.getElementById("name").value = "";
            document.getElementById("email").value = "";
            document.getElementById("msg").value = "";
        }
    } catch (err) {
        alert("Failed to submit feedback.");
    }
}

// 📂 Tips
function openTip(id) {
    showScreen(id);
}

// 📊 Dashboards
let chartsLoaded = false;
let actChart, sosChart, safeChart;

function loadChart() {
    if (chartsLoaded) return;

    let ctxActivity = document.getElementById("activityChart");
    let ctxSOS = document.getElementById("sosChart");
    let ctxStats = document.getElementById("safetyStatsChart");

    if (!ctxActivity || !ctxSOS || !ctxStats) return;

    actChart = new Chart(ctxActivity.getContext("2d"), {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'App Usage (hrs)',
                data: [1, 2, 1.5, 3, 2, 4, 3],
                borderColor: '#6c5ce7',
                backgroundColor: 'rgba(108, 92, 231, 0.2)',
                fill: true
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    sosChart = new Chart(ctxSOS.getContext("2d"), {
        type: 'pie',
        data: {
            labels: ['Accident', 'Harassment', 'Suspicious', 'Medical'],
            datasets: [{
                data: [15, 40, 25, 20],
                backgroundColor: ['#e74c3c', '#fdcb6e', '#00cec9', '#a29bfe']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    safeChart = new Chart(ctxStats.getContext("2d"), {
        type: 'doughnut',
        data: {
            labels: ['Safe Zones', 'Moderate', 'High Risk'],
            datasets: [{
                data: [60, 25, 15],
                backgroundColor: ['#00b894', '#fdcb6e', '#d63031']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    chartsLoaded = true;
}

// 📈 Dashboard Tab Switching
function showTab(tabId) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach((tab, index) => {
        if (index + 1 === tabId) {
            tab.classList.add('active');
            tab.style.display = 'block';
        } else {
            tab.classList.remove('active');
            tab.style.display = 'none';
        }
    });
}

// 🗺️ Live Map
let map;
let mapInitialized = false;
let marker;
let watchId;

function initMap() {
    if (mapInitialized) return;

    // Default location
    let defaultLoc = [20.5937, 78.9629]; // India center

    map = L.map('map').setView(defaultLoc, 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
    }).addTo(map);

    mapInitialized = true;

    // Get real location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            let lat = pos.coords.latitude;
            let lon = pos.coords.longitude;
            map.setView([lat, lon], 15);

            let iconCode = `<div style="background:var(--primary);width:20px;height:20px;border-radius:50%;border:4px solid white;box-shadow:0 0 10px rgba(0,0,0,0.5);"></div>`;
            let customIcon = L.divIcon({
                className: 'custom-marker',
                html: iconCode,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            marker = L.marker([lat, lon], { icon: customIcon }).addTo(map)
                .bindPopup("<b>Your Current Location</b>").openPopup();

            // Update location continuously
            watchId = navigator.geolocation.watchPosition(updatePos => {
                let uLat = updatePos.coords.latitude;
                let uLon = updatePos.coords.longitude;
                marker.setLatLng([uLat, uLon]);

                // Ping backend to store location history
                fetch('/api/location', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat: uLat, lng: uLon })
                }).catch(e => console.log("Failed tracking ping"));

            });

        }, () => {
            console.log("Location access denied or unavailable.");
            alert("Could not access location for live map.");
        });
    }
}

// 🗺️📍 Live Tracking Dashboard (History + Current)
let liveMap;
let liveMapInitialized = false;
let liveMarker;
let livePolyline;
let liveWatchId;

async function initLiveTrackingMap() {
    if (liveMapInitialized) {
        liveMap.invalidateSize();
        return;
    }

    // Default location
    let defaultLoc = [20.5937, 78.9629];

    liveMap = L.map('liveMap').setView(defaultLoc, 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(liveMap);

    liveMapInitialized = true;

    // Fetch history
    try {
        let res = await fetch('/api/get_locations');
        let data = await res.json();

        let latlngs = [];
        if (data.status === 'success' && data.locations && data.locations.length > 0) {
            data.locations.forEach(loc => {
                latlngs.push([loc.lat, loc.lng]);
            });
            // Draw polyline for history history
            livePolyline = L.polyline(latlngs, { color: 'red', weight: 4 }).addTo(liveMap);
            liveMap.fitBounds(livePolyline.getBounds());

            // Add marker to last known pos
            let lastLoc = latlngs[latlngs.length - 1];
            let iconCode = `<div style="background:var(--primary);width:20px;height:20px;border-radius:50%;border:4px solid white;box-shadow:0 0 10px rgba(0,0,0,0.5);"></div>`;
            let customIcon = L.divIcon({ className: 'custom-marker', html: iconCode, iconSize: [20, 20], iconAnchor: [10, 10] });
            liveMarker = L.marker(lastLoc, { icon: customIcon }).addTo(liveMap).bindPopup("<b>Last Known Past Position</b>").openPopup();
        } else {
            livePolyline = L.polyline([], { color: 'red', weight: 4 }).addTo(liveMap);
        }
    } catch (err) {
        console.log("Error fetching location history:", err);
        livePolyline = L.polyline([], { color: 'red', weight: 4 }).addTo(liveMap);
    }

    // Get real location continuously
    if (navigator.geolocation) {
        liveWatchId = navigator.geolocation.watchPosition(updatePos => {
            let uLat = updatePos.coords.latitude;
            let uLon = updatePos.coords.longitude;
            let currentLatLng = [uLat, uLon];

            if (!liveMarker) {
                let iconCode = `<div style="background:var(--primary);width:20px;height:20px;border-radius:50%;border:4px solid white;box-shadow:0 0 10px rgba(0,0,0,0.5);"></div>`;
                let customIcon = L.divIcon({ className: 'custom-marker', html: iconCode, iconSize: [20, 20], iconAnchor: [10, 10] });
                liveMarker = L.marker(currentLatLng, { icon: customIcon }).addTo(liveMap);
            }
            liveMarker.setLatLng(currentLatLng)
                .bindPopup("<b>Current Position</b>").openPopup();

            // Extend the sequence
            livePolyline.addLatLng(currentLatLng);

            // Ping backend
            fetch('/api/location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: uLat, lng: uLon })
            }).catch(e => console.log("Failed tracking ping"));

        }, () => {
            alert("Could not access location for live tracking.");
        }, { enableHighAccuracy: true });
    }
}

// 👤 AUTHENTICATION
let isSignUpMode = false;

function toggleAuth() {
    isSignUpMode = !isSignUpMode;
    const title = document.getElementById("authTitle");
    const btn = document.getElementById("authBtn");
    const toggleText = document.getElementById("authToggleText");
    const phoneInput = document.getElementById("phone");
    const msg = document.getElementById("authMessage");

    msg.innerText = "";
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
    phoneInput.value = "";

    if (isSignUpMode) {
        title.innerText = "Sign Up";
        btn.innerText = "Create Account";
        btn.setAttribute("onclick", "signupUser()");
        toggleText.innerText = "Already have an account? Login";
        phoneInput.style.display = "block";
    } else {
        title.innerText = "Login";
        btn.innerText = "Login";
        btn.setAttribute("onclick", "loginUser()");
        toggleText.innerText = "Don't have an account? Sign Up";
        phoneInput.style.display = "none";
    }
}

async function signupUser() {
    let name = document.getElementById("username").value;
    let phone = document.getElementById("phone").value;
    let pwd = document.getElementById("password").value;
    let msg = document.getElementById("authMessage");

    if (!name || !phone || !pwd) {
        msg.innerText = "Enter all details";
        return;
    }

    try {
        let res = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: name, phone: phone, password: pwd })
        });
        let data = await res.json();

        if (data.status === 'success') {
            msg.style.color = "green";
            msg.innerText = "Signup Success!";
            document.getElementById("welcomeUser").innerText = "Welcome, " + name;
            showScreen("home");
            displayContacts();
        } else {
            msg.style.color = "red";
            msg.innerText = data.message;
        }
    } catch (err) {
        msg.innerText = "Server Error!";
    }
}

async function loginUser() {
    let name = document.getElementById("username").value;
    let pwd = document.getElementById("password").value;
    let msg = document.getElementById("authMessage");

    if (!name || !pwd) {
        msg.innerText = "Enter username and password";
        return;
    }

    try {
        let res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: name, password: pwd })
        });
        let data = await res.json();

        if (data.status === 'success') {
            msg.style.color = "green";
            msg.innerText = "Login Success!";
            document.getElementById("welcomeUser").innerText = "Welcome, " + data.username;
            showScreen("home");
            displayContacts();
        } else {
            msg.style.color = "red";
            msg.innerText = data.message;
        }
    } catch (err) {
        msg.innerText = "Server Error!";
    }
}

async function logoutUser() {
    try {
        let res = await fetch('/api/logout', { method: 'POST' });
        let data = await res.json();
        if (data.status === 'success') {
            showScreen("login");
        }
    } catch (e) {
        alert("Error logging out");
    }
}

async function checkUser() {
    try {
        let res = await fetch('/api/user');
        let data = await res.json();
        if (data.status === 'success') {
            document.getElementById("welcomeUser").innerText = "Welcome, " + data.username;
            showScreen("home");
            displayContacts();
        } else {
            showScreen("intro");
        }
    } catch (e) {
        showScreen("intro");
    }
}

// ➕ Add Contact
async function addContact() {
    let num = document.getElementById("contactNumber").value;

    if (!num) {
        alert("Enter number");
        return;
    }

    try {
        let res = await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: num })
        });
        let data = await res.json();
        if (data.status === 'success') {
            document.getElementById("contactNumber").value = "";
            displayContacts();
        }
    } catch (e) {
        alert("Error saving contact");
    }
}

// 📋 Show Contacts
async function displayContacts() {
    let list = document.getElementById("contactList");
    list.innerHTML = "Loading...";

    try {
        let res = await fetch('/api/contacts');
        let data = await res.json();

        if (data.status === 'success') {
            list.innerHTML = "";
            let contacts = data.contacts;

            if (contacts.length === 0) {
                list.innerHTML = "<p>No contacts added yet.</p>";
                return;
            }

            contacts.forEach((c) => {
                let div = document.createElement("div");
                div.className = "card";
                div.innerHTML = `
                    ${c.phone}
                    <button onclick="deleteContact(${c.id})" style="background:red;margin-top:5px;width:auto;padding:5px 15px;float:right;">Delete</button>
                    <div style="clear:both;"></div>
                `;
                list.appendChild(div);
            });
        } else {
            list.innerHTML = "Not authenticated";
        }
    } catch (e) {
        list.innerHTML = "Error loading contacts.";
    }
}

// ❌ Delete Contact
async function deleteContact(id) {
    try {
        let res = await fetch('/api/contacts/' + id, { method: 'DELETE' });
        let data = await res.json();
        if (data.status === 'success') {
            displayContacts();
        }
    } catch (e) {
        alert("Error deleting contact");
    }
}

// 🔥 APP START
window.onload = function () {
    // Check if user is logged in
    checkUser();

    // Image slider
    let circleImages = document.querySelectorAll(".circle-img");
    let current = 0;

    if (circleImages.length > 0) {
        setInterval(() => {
            circleImages.forEach(img => img.classList.remove("active"));
            current = (current + 1) % circleImages.length;
            circleImages[current].classList.add("active");
        }, 2500);
    }
};

function showSlide(index) {
    let slides = document.querySelectorAll(".intro-slide");

    slides.forEach((slide, i) => {
        slide.classList.remove("active");
        if (i === index) {
            slide.classList.add("active");
        }
    });
}

function nextSlide() {
    let slides = document.querySelectorAll(".intro-slide");
    currentSlide++;

    if (currentSlide < slides.length) {
        showSlide(currentSlide);
    } else {
        showScreen('login');
    }
}

function skipIntro() {
    showScreen('login');
}

// Siren Audio Controller
let isSirenPlaying = false;
function playSiren() {
    const audio = document.getElementById('sirenAudioRoot');
    if (!audio) return;

    if (isSirenPlaying) {
        audio.pause();
        audio.currentTime = 0;
        isSirenPlaying = false;
        alert("Siren Stopped.");
    } else {
        audio.play().catch(e => console.log('Audio error:', e));
        isSirenPlaying = true;
    }
}

// Fake Call Feature Simple
function triggerFakeCall() {
    alert("Fake Call Scheduled... Ringing in 3 seconds.");
    setTimeout(() => {
        const ringtone = document.getElementById('ringtoneAudioRoot');
        if (ringtone) {
            ringtone.play().catch(e => console.log('Audio error:', e));
        }

        let accepted = confirm("Incoming Call from 'Dad'. Press OK to Answer, Cancel to Decline.");
        if (ringtone) ringtone.pause();

        if (accepted) {
            alert("Call connected... (Simulated talk).");
        }
    }, 3000);
}