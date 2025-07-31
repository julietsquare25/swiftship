// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAr-aFO9xK7oVAgg3Kny0bUHRoTwC1bHLw",
  authDomain: "doordashconsole.firebaseapp.com",
  databaseURL: "https://doordashconsole-default-rtdb.firebaseio.com",
  projectId: "doordashconsole",
  storageBucket: "doordashconsole.firebasestorage.app",
  messagingSenderId: "843944254913",
  appId: "1:843944254913:web:88198ddc9b45e850972340",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Global variables for Leaflet map
let map;
let senderMarker;
let receiverMarker;
let packageMarker;
let routeLine;
let moveInterval;

// Track package function
function trackPackage(trackingId = null) {
  const trackingNumber =
    trackingId ||
    document.getElementById("tracking-number")?.value ||
    document.getElementById("tracking-id")?.value;

  if (!trackingNumber) {
    showAlert("Please enter a tracking number", "danger");
    return;
  }

  if (
    window.location.pathname === "/index.html" ||
    window.location.pathname === "/"
  ) {
    window.location.href = `tracking.html?id=${trackingNumber}`;
    return;
  }

  // Show loading state
  document.getElementById("tracking-results").innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-primary mb-3" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <h5>Tracking shipment ${trackingNumber}</h5>
    </div>
  `;

  // Clear any existing interval
  if (moveInterval) clearInterval(moveInterval);

  // Check Firebase for shipment
  db.ref(`shipments/${trackingNumber}`)
    .once("value")
    .then((snapshot) => {
      const shipment = snapshot.val();
      if (!shipment) {
        showTrackingError(trackingNumber);
        return;
      }

      displayTrackingResults(trackingNumber, shipment);
      initMap(shipment);
    })
    .catch((error) => {
      console.error("Tracking error:", error);
      showAlert("Error tracking shipment. Please try again.", "danger");
    });
}

// Initialize Leaflet Map
function initMap(shipment) {
  // Remove existing map if it exists
  if (map) {
    map.remove();
    document.getElementById("map").innerHTML = "";
  }

  // Create new map with default view
  map = L.map("map").setView([0, 0], 2);

  // Add OpenStreetMap tiles
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // Add markers after geocoding addresses
  geocodeAndAddMarkers(shipment);
}

// Geocode addresses and add markers
async function geocodeAndAddMarkers(shipment) {
  try {
    const senderCoords = await geocodeAddress(shipment.sender?.address);
    const receiverCoords = await geocodeAddress(shipment.receiver?.address);

    if (!senderCoords || !receiverCoords) {
      throw new Error("Could not geocode addresses");
    }

    // Add sender marker (blue)
    senderMarker = L.marker(senderCoords, {
      icon: L.divIcon({
        html: '<i class="fas fa-user" style="color: #0d6efd; font-size: 24px;"></i>',
        iconSize: [24, 24],
        className: "marker-icon",
      }),
    })
      .addTo(map)
      .bindPopup("<b>Sender</b><br>" + (shipment.sender?.address || ""));

    // Add receiver marker (red)
    receiverMarker = L.marker(receiverCoords, {
      icon: L.divIcon({
        html: '<i class="fas fa-home" style="color: #dc3545; font-size: 24px;"></i>',
        iconSize: [24, 24],
        className: "marker-icon",
      }),
    })
      .addTo(map)
      .bindPopup("<b>Receiver</b><br>" + (shipment.receiver?.address || ""));

    // Add package marker (green)
    const packageCoords = shipment.currentLocation || senderCoords;
    packageMarker = L.marker(packageCoords, {
      icon: L.divIcon({
        html: '<i class="fas fa-box" style="color: #198754; font-size: 24px;"></i>',
        iconSize: [24, 24],
        className: "marker-icon",
      }),
    })
      .addTo(map)
      .bindPopup("<b>Your Package</b><br>" + (shipment.status || "In transit"));

    // Draw route line
    routeLine = L.polyline([senderCoords, receiverCoords], {
      color: "#0d6efd",
      weight: 3,
      dashArray: "5, 5",
    }).addTo(map);

    // Fit map to show all markers
    map.fitBounds([senderCoords, receiverCoords]);

    // Simulate movement if in transit
    if (shipment.status !== "Delivered") {
      simulatePackageMovement(packageCoords, receiverCoords, shipment);
    }
  } catch (error) {
    console.error("Map error:", error);
    document.getElementById("map-container").innerHTML = `
      <div class="alert alert-warning">
        <i class="fas fa-exclamation-triangle me-2"></i>
        Could not load map: ${error.message}
      </div>
    `;
  }
}

// Geocode address using Nominatim (OpenStreetMap)
function geocodeAddress(address) {
  return new Promise((resolve) => {
    if (!address) {
      resolve(null);
      return;
    }

    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`
    )
      .then((response) => response.json())
      .then((data) => {
        if (data && data.length > 0) {
          resolve([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
        } else {
          resolve(null);
        }
      })
      .catch(() => resolve(null));
  });
}

// Simulate package movement
function simulatePackageMovement(startCoords, endCoords, shipment) {
  let currentPos = 0;
  const steps = 100;
  const latStep = (endCoords[0] - startCoords[0]) / steps;
  const lngStep = (endCoords[1] - startCoords[1]) / steps;

  moveInterval = setInterval(() => {
    if (currentPos >= steps) {
      clearInterval(moveInterval);
      packageMarker.setPopupContent("<b>Delivered</b>");
      return;
    }

    const newLat = startCoords[0] + latStep * currentPos;
    const newLng = startCoords[1] + lngStep * currentPos;
    packageMarker.setLatLng([newLat, newLng]);

    // Update progress
    const progress = Math.floor((currentPos / steps) * 100);
    updateProgressBar(progress, shipment.status);
    updateETA(currentPos, steps, shipment);

    currentPos++;
  }, 100);
}

// Display tracking results
function displayTrackingResults(trackingNumber, shipment) {
  // Show tracking details section
  document.getElementById("tracking-results").classList.add("d-none");
  document.getElementById("tracking-details").classList.remove("d-none");

  // Update basic info
  document.getElementById("tracking-id-display").textContent = trackingNumber;

  // Update status
  const statusBadge = document.getElementById("shipment-status");
  statusBadge.textContent = shipment.status;
  statusBadge.className = "badge " + getStatusClass(shipment.status);

  // Calculate and display ETA if not already set
  if (!shipment.eta) {
    shipment.eta = calculateInitialETA(shipment);
  }
  document.getElementById("eta-display").textContent = shipment.eta;

  // Update dates
  document.getElementById("last-updated").textContent = formatDate(
    shipment.updatedAt || shipment.createdAt
  );

  // Update progress bar
  const progressBar = document.getElementById("progress-bar");
  const progress =
    shipment.progress || (shipment.status === "Delivered" ? 100 : 0);
  progressBar.style.width = `${progress}%`;
  progressBar.textContent = `${progress}%`;
  progressBar.className = "progress-bar " + getStatusClass(shipment.status);

  // Update sender/receiver info
  if (shipment.sender) {
    document.getElementById("sender-name").textContent =
      shipment.sender.name || "N/A";
    document.getElementById("sender-phone").textContent =
      shipment.sender.phone || "N/A";
    document.getElementById("sender-address").textContent =
      shipment.sender.address || "N/A";
  }

  // Update package details including image
  if (shipment.package) {
    document.getElementById("package-description").textContent =
      shipment.package.description || "Not specified";

    document.getElementById("package-weight").textContent = shipment.package
      .weight
      ? `${shipment.package.weight} kg`
      : "Not specified";

    document.getElementById("package-dimensions").textContent =
      shipment.package.dimensions || "Not specified";

    document.getElementById("package-contents").textContent =
      shipment.package.contents || "Not specified";

    document.getElementById("package-instructions").textContent =
      shipment.package.instructions || "None";

    // Handle package image
    const imageContainer = document.getElementById("package-image-container");
    const packageImage = document.getElementById("image-url");

    if (shipment.package.image) {
      packageImage.src = shipment.package.image;
      packageImage.alt = `Package ${trackingNumber}`;
      imageContainer.style.display = "block";

      // Add error handling for broken images
      packageImage.onerror = function () {
        imageContainer.innerHTML = `
        <div class="alert alert-warning py-2 my-0">
          <i class="fas fa-exclamation-triangle me-2"></i>
          Could not load package image
        </div>
      `;
      };
    } else {
      imageContainer.style.display = "none";
    }
  } else {
    document.getElementById("package-image-container").style.display = "none";
  }

  if (shipment.receiver) {
    document.getElementById("receiver-name").textContent =
      shipment.receiver.name || "N/A";
    document.getElementById("receiver-phone").textContent =
      shipment.receiver.phone || "N/A";
    document.getElementById("receiver-address").textContent =
      shipment.receiver.address || "N/A";
  }

  // Update timeline
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = "";

  // Add created event
  addTimelineItem(timeline, "Shipment created", shipment.createdAt, true);

  // Add status updates
  if (shipment.statusUpdates) {
    Object.values(shipment.statusUpdates).forEach((update) => {
      addTimelineItem(
        timeline,
        update.message || update.status,
        update.timestamp
      );
    });
  } else {
    // Fallback if no status updates are stored
    addTimelineItem(
      timeline,
      `Status changed to ${shipment.status}`,
      shipment.updatedAt || shipment.createdAt
    );
  }
}

// Calculate initial ETA based on shipment data
function calculateInitialETA(shipment) {
  if (shipment.eta) return shipment.eta;

  const createdDate = new Date(shipment.createdAt);
  let etaDate = new Date(createdDate);

  // Add time based on status
  switch (shipment.status) {
    case "Processing":
      etaDate.setHours(etaDate.getHours() + 2);
      break;
    case "In Transit":
      etaDate.setHours(etaDate.getHours() + 6);
      break;
    case "Out for Delivery":
      etaDate.setHours(etaDate.getHours() + 2);
      break;
    case "Delivered":
      return "Delivered";
    default:
      etaDate.setHours(etaDate.getHours() + 4);
  }

  return formatETADate(etaDate);
}

// Helper function to add timeline items
function addTimelineItem(timeline, text, timestamp, isFirst = false) {
  const item = document.createElement("div");
  item.className = "timeline-item" + (isFirst ? " active" : "");
  item.innerHTML = `
        <h6 class="mb-1">${text}</h6>
        <p class="timeline-date mb-0">${formatDate(timestamp)}</p>
    `;
  timeline.appendChild(item);
}

// Helper function to get status class
function getStatusClass(status) {
  const statusClasses = {
    Processing: "bg-secondary",
    "In Transit": "bg-primary",
    "Out for Delivery": "bg-info",
    Delivered: "bg-success",
    Returned: "bg-warning",
  };
  return statusClasses[status] || "bg-secondary";
}

// Helper function to format date
function formatDate(timestamp) {
  if (!timestamp) return "N/A";
  const date = new Date(timestamp);
  return (
    date.toLocaleDateString() +
    " " +
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

// Show tracking error
function showTrackingError(trackingNumber) {
  document.getElementById("tracking-results").innerHTML = `
        <div class="text-center py-5">
            <i class="fas fa-exclamation-triangle fa-4x text-danger mb-3"></i>
            <h5>Shipment not found</h5>
            <p class="mb-3">No shipment found with tracking number: ${trackingNumber}</p>
            <button class="btn btn-primary" onclick="window.history.back()">Try Again</button>
        </div>
    `;
}

// Show alert message
function showAlert(message, type) {
  const alert = document.createElement("div");
  alert.className = `alert alert-${type} alert-dismissible fade show`;
  alert.role = "alert";
  alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

  const container =
    document.getElementById("tracking-results") ||
    document.querySelector(".tracking-form") ||
    document.body;

  container.prepend(alert);

  setTimeout(() => {
    alert.classList.remove("show");
    setTimeout(() => alert.remove(), 150);
  }, 5000);
}

// Set up form submission
document.addEventListener("DOMContentLoaded", function () {
  const trackingForm = document.getElementById("tracking-form");
  if (trackingForm) {
    trackingForm.addEventListener("submit", function (e) {
      e.preventDefault();
      trackPackage();
    });
  }

  // If on tracking page with ID in URL, track immediately
  const urlParams = new URLSearchParams(window.location.search);
  const trackingId = urlParams.get("id");
  if (trackingId) {
    trackPackage(trackingId);
  } else {
    // Otherwise focus the input field
    const input = document.getElementById("tracking-id");
    if (input) input.focus();
  }
});

// Rest of your existing functions (displayTrackingResults, updateProgressBar, etc.)
// ... keep all other functions unchanged ...
