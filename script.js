const locationBtn = document.getElementById("locationBtn");
const locationStatus = document.getElementById("locationStatus");
const searchForm = document.getElementById("searchForm");
const foodSearch = document.getElementById("foodSearch");
const results = document.getElementById("results");
const message = document.getElementById("message");
const resultsTitle = document.getElementById("resultsTitle");
const resultCount = document.getElementById("resultCount");

let userLocation = null;

locationBtn.addEventListener("click", getCurrentLocation);
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchNearbyFood(foodSearch.value.trim());
});

document.querySelectorAll("[data-food]").forEach((button) => {
  button.addEventListener("click", () => {
    foodSearch.value = button.dataset.food;
    searchNearbyFood(button.dataset.food);
  });
});

function getCurrentLocation() {
  if (!navigator.geolocation) {
    setMessage("Your browser does not support location sharing.");
    return;
  }
  locationStatus.textContent = "Getting your location...";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
      };
      locationStatus.textContent = "Location found ✓";
      if (foodSearch.value.trim()) searchNearbyFood(foodSearch.value.trim());
      else setMessage("Location found! Now search for a food item.");
    },
    (error) => {
      const messages = {
        1: "Location permission was denied. Allow it in your browser settings.",
        2: "Your location is currently unavailable. Try again.",
        3: "Location request timed out. Please try again."
      };
      locationStatus.textContent = messages[error.code] || "Could not get location.";
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
  );
}

async function searchNearbyFood(food) {
  if (!food) {
    setMessage("Please enter a food item to search.");
    return;
  }
  if (!userLocation) {
    setMessage("First select “Use my current location” and allow location access.");
    return;
  }

  results.innerHTML = "";
  resultsTitle.textContent = `Places related to ${food}`;
  setMessage("Searching nearby places...");
  resultCount.textContent = "Searching";

  // OpenStreetMap data lists nearby food businesses. It does not reliably contain menus/prices.
  const query = `
    [out:json][timeout:25];
    (
      node(around:5000,${userLocation.lat},${userLocation.lon})[amenity~"restaurant|fast_food|cafe|food_court"];
      way(around:5000,${userLocation.lat},${userLocation.lon})[amenity~"restaurant|fast_food|cafe|food_court"];
      relation(around:5000,${userLocation.lat},${userLocation.lon})[amenity~"restaurant|fast_food|cafe|food_court"];
    );
    out center tags;
  `;

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "data=" + encodeURIComponent(query)
    });
    if (!response.ok) throw new Error("Map service is temporarily unavailable.");
    const data = await response.json();

    const foodWords = food.toLowerCase().split(/\s+/).filter(Boolean);
    const places = data.elements.map((item) => {
      const tags = item.tags || {};
      const lat = item.lat ?? item.center?.lat;
      const lon = item.lon ?? item.center?.lon;
      if (lat == null || lon == null || !tags.name) return null;
      const searchable = [
        tags.name, tags.cuisine, tags.description, tags["diet:vegetarian"]
      ].join(" ").toLowerCase();
      const match = foodWords.some((word) => searchable.includes(word));
      return {
        name: tags.name,
        type: tags.amenity || "food place",
        cuisine: tags.cuisine || "Cuisine not listed",
        address: formatAddress(tags),
        lat, lon,
        distance: getDistance(userLocation.lat, userLocation.lon, lat, lon),
        match
      };
    }).filter(Boolean);

    // Show cuisine/name matches first; if map data has no food-specific tags, show nearby places.
    places.sort((a, b) => Number(b.match) - Number(a.match) || a.distance - b.distance);
    const shown = places.slice(0, 30);
    resultCount.textContent = `${shown.length} places`;
    if (!shown.length) {
      setMessage("No named food places were found within 5 km. Try another search or a different location.");
      return;
    }
    message.textContent = places.some((place) => place.match)
      ? `Showing nearby places with matching food/cuisine details first.`
      : `Nearby food places found. Their map listings do not specify whether they serve ${food}, so please confirm with them.`;
    shown.forEach((place) => results.appendChild(createPlaceCard(place, food)));
  } catch (error) {
    resultCount.textContent = "0 places";
    setMessage(`${error.message} Check your internet connection and try again.`);
  }
}

function createPlaceCard(place, food) {
  const card = document.createElement("article");
  card.className = "place-card";
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`;
  const icon = place.type === "cafe" ? "☕" : place.type === "fast_food" ? "🍔" : "🍽️";
  card.innerHTML = `
    <div class="place-top">
      <div class="food-icon">${icon}</div>
      <div>
        <h3></h3>
        <span class="kind"></span>
      </div>
    </div>
    <p class="detail"></p>
    <div class="meta">
      <span class="distance"></span>
      <span class="price">Price: Not listed</span>
    </div>
    <a class="map-link" target="_blank" rel="noopener noreferrer">Get directions ↗</a>
  `;
  card.querySelector("h3").textContent = place.name;
  card.querySelector(".kind").textContent = place.cuisine;
  card.querySelector(".detail").textContent = place.address || "Address not listed in map data.";
  card.querySelector(".distance").textContent = `${place.distance.toFixed(1)} km away`;
  card.querySelector(".map-link").href = mapsUrl;
  return card;
}

function formatAddress(tags) {
  const parts = [
    tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"],
    tags["addr:city"], tags["addr:postcode"]
  ].filter(Boolean);
  return parts.join(", ") || "Full address not listed in map data.";
}

function getDistance(lat1, lon1, lat2, lon2) {
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function setMessage(text) {
  message.textContent = text;
}