const lookupForm = document.querySelector("#lookupForm");
const notificationForm = document.querySelector("#notificationForm");

const lookupButton = document.querySelector("#lookupButton");
const notifyButton = document.querySelector("#notifyButton");

const statusPanel = document.querySelector("#statusPanel");
const notificationCard = document.querySelector("#notificationCard");

const lookupMessage = document.querySelector("#lookupMessage");
const notificationMessage = document.querySelector("#notificationMessage");

let currentTrackingNumber = "";
let currentNormalizedStatus = "";

const statusContent = {
  PRE_SHIPMENT: {
    title: "Label Created — Not in Transit",
    badge: "Not shipped",
    badgeClass: "warning",
    explanation:
      "A shipping label was created, but USPS has not received or scanned the package. Do not advise the customer that the package is in transit.",
    script:
      "The shipping label has been created, but USPS does not have the package yet. Would you like us to email you when the tracking status changes?"
  },

  ACCEPTED: {
    title: "Accepted by USPS",
    badge: "Carrier has package",
    badgeClass: "active",
    explanation:
      "USPS has physically accepted or scanned the package.",
    script:
      "USPS has received your package. Would you like us to email you when there is another tracking update?"
  },

  IN_TRANSIT: {
    title: "In Transit",
    badge: "In transit",
    badgeClass: "active",
    explanation:
      "The package is moving through the USPS network.",
    script:
      "Your package is currently in transit. Would you like us to email you when there is another tracking update?"
  },

  OUT_FOR_DELIVERY: {
    title: "Out for Delivery",
    badge: "Arriving today",
    badgeClass: "active",
    explanation:
      "USPS reports that the package is out for delivery.",
    script:
      "Your package is out for delivery today. Would you like us to email you when the delivery status changes?"
  },

  DELIVERED: {
    title: "Delivered",
    badge: "Delivered",
    badgeClass: "success",
    explanation:
      "USPS reports that the package was delivered.",
    script:
      "USPS reports that your package was delivered."
  },

  EXCEPTION: {
    title: "Delivery Exception",
    badge: "Attention needed",
    badgeClass: "error",
    explanation:
      "USPS reported a delay, address issue, return, or another delivery exception.",
    script:
      "USPS reported an issue with the shipment. I will review the latest tracking details with you."
  },

  UNKNOWN: {
    title: "Status Unavailable",
    badge: "Review needed",
    badgeClass: "error",
    explanation:
      "The shipment status could not be clearly identified. Review the carrier status before advising the customer.",
    script:
      "I am reviewing the latest USPS tracking information so I can give you the correct status."
  }
};

function normalizeTrackingNumber(value) {
  return value.replace(/\s+/g, "").trim();
}

function formatTrackingNumber(value) {
  return value.replace(/(.{4})/g, "$1 ").trim();
}

function showMessage(element, message, type = "") {
  element.textContent = message;
  element.className = `message ${type}`.trim();
  element.classList.remove("hidden");
}

function hideMessage(element) {
  element.textContent = "";
  element.classList.add("hidden");
}

function setButtonLoading(button, isLoading, loadingText, defaultText) {
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : defaultText;
}

function formatDateTime(value) {
  if (!value) {
    return "No carrier scan available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function renderStatus(result) {
  const normalizedStatus = result.normalizedStatus || "UNKNOWN";
  const display = statusContent[normalizedStatus] || statusContent.UNKNOWN;

  const badge = document.querySelector("#statusBadge");

  document.querySelector("#statusTitle").textContent = display.title;
  document.querySelector("#statusExplanation").textContent =
    display.explanation;
  document.querySelector("#agentScript").textContent = display.script;

  document.querySelector("#resultTrackingNumber").textContent =
    formatTrackingNumber(result.trackingNumber || currentTrackingNumber);

  document.querySelector("#latestUpdate").textContent =
    formatDateTime(result.latestUpdate);

  document.querySelector("#latestLocation").textContent =
    result.latestLocation || "No location available";

  document.querySelector("#rawStatus").textContent =
    result.rawStatus || "No carrier status available";

  badge.textContent = display.badge;
  badge.className = `badge ${display.badgeClass}`;

  currentTrackingNumber =
    result.trackingNumber || currentTrackingNumber;

  currentNormalizedStatus = normalizedStatus;

  statusPanel.classList.remove("hidden");
  notificationCard.classList.remove("hidden");

  notificationCard.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
}

lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  hideMessage(lookupMessage);
  hideMessage(notificationMessage);

  statusPanel.classList.add("hidden");
  notificationCard.classList.add("hidden");

  const trackingInput = document.querySelector("#trackingNumber");
  const trackingNumber = normalizeTrackingNumber(trackingInput.value);

  if (!trackingNumber) {
    showMessage(
      lookupMessage,
      "Enter a USPS tracking number.",
      "error"
    );
    trackingInput.focus();
    return;
  }

  currentTrackingNumber = trackingNumber;
  currentNormalizedStatus = "";

  setButtonLoading(
    lookupButton,
    true,
    "Checking Endicia…",
    "Check status"
  );

  try {
    const response = await fetch("/api/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        trackingNumber
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
          "Unable to retrieve the tracking status."
      );
    }

    renderStatus(data);
  } catch (error) {
    showMessage(
      lookupMessage,
      error.message ||
        "Unable to retrieve the tracking status.",
      "error"
    );
  } finally {
    setButtonLoading(
      lookupButton,
      false,
      "Checking Endicia…",
      "Check status"
    );
  }
});

notificationForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  hideMessage(notificationMessage);

  const customerName = document
    .querySelector("#customerName")
    .value.trim();

  const customerEmail = document
    .querySelector("#customerEmail")
    .value.trim();

  const customerConsent = document
    .querySelector("#customerConsent")
    .checked;

  if (!currentTrackingNumber || !currentNormalizedStatus) {
    showMessage(
      notificationMessage,
      "Check the tracking status before enrolling the customer.",
      "error"
    );
    return;
  }

  if (!customerEmail) {
    showMessage(
      notificationMessage,
      "Enter the customer’s email address.",
      "error"
    );
    document.querySelector("#customerEmail").focus();
    return;
  }

  if (!customerConsent) {
    showMessage(
      notificationMessage,
      "Confirm that the customer agreed to receive shipment-status emails.",
      "error"
    );
    return;
  }

  setButtonLoading(
    notifyButton,
    true,
    "Enrolling customer…",
    "Enroll customer for updates"
  );

  try {
    const response = await fetch("/api/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        trackingNumber: currentTrackingNumber,
        customerName,
        customerEmail,
        currentStatus: currentNormalizedStatus,
        customerConsent
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
          "Unable to enroll the customer."
      );
    }

    showMessage(
      notificationMessage,
      "Customer enrolled successfully. Connect America will email them after a meaningful tracking-status change.",
      "success"
    );

    notificationForm.reset();
  } catch (error) {
    showMessage(
      notificationMessage,
      error.message ||
        "Unable to enroll the customer.",
      "error"
    );
  } finally {
    setButtonLoading(
      notifyButton,
      false,
      "Enrolling customer…",
      "Enroll customer for updates"
    );
  }
});
