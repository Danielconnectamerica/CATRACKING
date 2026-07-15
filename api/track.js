// /api/track.js
// Connect America USPS tracking lookup through Stamps.com/Endicia SERA.

const SIGNIN_BASE =
  process.env.SERA_SIGNIN_BASE ||
  "https://signin.stampsendicia.com";

const API_BASE =
  process.env.SERA_API_BASE ||
  "https://api.stampsendicia.com/sera";

const CLIENT_ID = process.env.SERA_CLIENT_ID;
const CLIENT_SECRET = process.env.SERA_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SERA_REFRESH_TOKEN;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function validateEnvironment() {
  const missing = [];

  if (!CLIENT_ID) missing.push("SERA_CLIENT_ID");
  if (!CLIENT_SECRET) missing.push("SERA_CLIENT_SECRET");
  if (!REFRESH_TOKEN) missing.push("SERA_REFRESH_TOKEN");

  if (missing.length) {
    throw new Error(
      `Missing Vercel environment variables: ${missing.join(", ")}`
    );
  }
}

async function getAccessToken() {
  validateEnvironment();

  const tokenUrl =
    `${SIGNIN_BASE.replace(/\/+$/, "")}/oauth/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN
    })
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.access_token) {
    console.error("Endicia token refresh failed", {
      httpStatus: response.status,
      response: data
    });

    throw new Error(
      `Endicia authentication failed. HTTP ${response.status}`
    );
  }

  return data.access_token;
}

function normalizeStatus(statusCode, carrierDescription, latestEvent) {
  const code = String(statusCode || "")
    .trim()
    .toLowerCase();

  const combinedText = [
    code,
    carrierDescription,
    latestEvent
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    code === "delivered" ||
    /\bdelivered\b/.test(combinedText)
  ) {
    return "DELIVERED";
  }

  if (
    code === "out_for_delivery" ||
    /out for delivery/.test(combinedText)
  ) {
    return "OUT_FOR_DELIVERY";
  }

  if (
    [
      "exception",
      "delivery_exception",
      "return_to_sender",
      "undeliverable"
    ].includes(code) ||
    /return to sender|undeliverable|delivery exception|insufficient address|no access|delivery attempted|alert/.test(
      combinedText
    )
  ) {
    return "EXCEPTION";
  }

  if (
    code === "accepted" ||
    /accepted|usps in possession|picked up by usps/.test(
      combinedText
    )
  ) {
    return "ACCEPTED";
  }

  if (
    [
      "in_transit",
      "transit",
      "moving"
    ].includes(code) ||
    /in transit|moving through network|arrived at|departed|processed through|moving within the usps network/.test(
      combinedText
    )
  ) {
    return "IN_TRANSIT";
  }

  if (
    [
      "pre_shipment",
      "label_created",
      "printed"
    ].includes(code) ||
    /pre[- ]?shipment|label created|shipping label created|printed|awaiting item|usps awaiting item/.test(
      combinedText
    )
  ) {
    return "PRE_SHIPMENT";
  }

  return "UNKNOWN";
}

function buildLocation(event) {
  if (!event) {
    return "";
  }

  return [
    event.city,
    event.state_province,
    event.postal_code,
    event.country_code
  ]
    .filter(Boolean)
    .join(", ");
}

async function getTracking(accessToken, trackingNumber) {
  const trackingUrl = new URL(
    `${API_BASE.replace(/\/+$/, "")}/v1/tracking`
  );

  trackingUrl.searchParams.set("carrier", "usps");
  trackingUrl.searchParams.set(
    "tracking_number",
    trackingNumber
  );

  const response = await fetch(trackingUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("Endicia tracking lookup failed", {
      httpStatus: response.status,
      response: data,
      trackingNumber
    });

    const apiMessage =
      data?.message ||
      data?.error?.message ||
      data?.error_description ||
      data?.error;

    throw new Error(
      apiMessage ||
        `Endicia tracking lookup failed. HTTP ${response.status}`
    );
  }

  return data;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return sendJson(res, 405, {
      ok: false,
      error: "Method not allowed."
    });
  }

  const trackingNumber = String(
    req.body?.trackingNumber || ""
  )
    .replace(/\s+/g, "")
    .trim();

  if (!trackingNumber) {
    return sendJson(res, 400, {
      ok: false,
      error: "A USPS tracking number is required."
    });
  }

  if (!/^[A-Za-z0-9]+$/.test(trackingNumber)) {
    return sendJson(res, 400, {
      ok: false,
      error:
        "The tracking number contains invalid characters."
    });
  }

  try {
    const accessToken = await getAccessToken();

    const trackingData = await getTracking(
      accessToken,
      trackingNumber
    );

    const events = Array.isArray(
      trackingData?.tracking_events
    )
      ? trackingData.tracking_events
      : [];

    const latestEvent = events[0] || null;

    const rawStatus =
      trackingData?.carrier_status_description ||
      trackingData?.status_code ||
      "Status unavailable";

    const normalizedStatus = normalizeStatus(
      trackingData?.status_code,
      trackingData?.carrier_status_description,
      latestEvent?.event_description
    );

    return sendJson(res, 200, {
      ok: true,
      trackingNumber:
        trackingData?.tracking_number ||
        trackingNumber,
      carrierName:
        trackingData?.carrier_name ||
        "USPS",
      normalizedStatus,
      statusCode:
        trackingData?.status_code ||
        "",
      rawStatus,
      estimatedDeliveryDate:
        trackingData?.estimated_delivery_date ||
        "",
      latestEvent:
        latestEvent?.event_description ||
        rawStatus,
      latestUpdate:
        latestEvent?.occurred_at ||
        "",
      latestLocation:
        buildLocation(latestEvent),
      trackingEvents: events
    });
  } catch (error) {
    console.error("Connect America tracking error", error);

    return sendJson(res, 500, {
      ok: false,
      error:
        error?.message ||
        "Unable to retrieve the USPS tracking status."
    });
  }
};
