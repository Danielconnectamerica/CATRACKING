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

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function validateEnvironmentVariables() {
  const missingVariables = [];

  if (!CLIENT_ID) missingVariables.push("SERA_CLIENT_ID");
  if (!CLIENT_SECRET) missingVariables.push("SERA_CLIENT_SECRET");
  if (!REFRESH_TOKEN) missingVariables.push("SERA_REFRESH_TOKEN");

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing Vercel environment variables: ${missingVariables.join(", ")}`
    );
  }
}

async function parseResponse(response) {
  const responseText = await response.text();

  if (!responseText) {
    return {
      data: null,
      responseText: ""
    };
  }

  try {
    return {
      data: JSON.parse(responseText),
      responseText
    };
  } catch {
    return {
      data: null,
      responseText
    };
  }
}

async function getAccessToken() {
  validateEnvironmentVariables();

  const tokenUrl =
    `${SIGNIN_BASE.replace(/\/+$/, "")}/oauth/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN
    })
  });

  const { data, responseText } =
    await parseResponse(response);

  if (!response.ok || !data?.access_token) {
    console.error("Endicia token refresh failed", {
      httpStatus: response.status,
      response: data || responseText
    });

    const errorMessage =
      data?.error_description ||
      data?.message ||
      data?.error;

    throw new Error(
      errorMessage ||
      `Endicia authentication failed. HTTP ${response.status}`
    );
  }

  return data.access_token;
}

function normalizeStatus(
  statusCode,
  carrierDescription,
  latestEventDescription
) {
  const code = String(statusCode || "")
    .trim()
    .toLowerCase();

  const carrierText = String(
    carrierDescription || ""
  )
    .trim()
    .toLowerCase();

  const eventText = String(
    latestEventDescription || ""
  )
    .trim()
    .toLowerCase();

  const combinedText =
    `${carrierText} ${eventText}`.trim();

  if (code === "delivered") {
    return "DELIVERED";
  }

  if (
    [
      "out_for_delivery",
      "out-for-delivery"
    ].includes(code)
  ) {
    return "OUT_FOR_DELIVERY";
  }

  if (
    [
      "exception",
      "delivery_exception",
      "return_to_sender",
      "undeliverable",
      "failure"
    ].includes(code)
  ) {
    return "EXCEPTION";
  }

  if (
    [
      "accepted",
      "carrier_accepted"
    ].includes(code)
  ) {
    return "ACCEPTED";
  }

  if (
    [
      "in_transit",
      "in-transit",
      "transit",
      "moving"
    ].includes(code)
  ) {
    return "IN_TRANSIT";
  }

  if (
    [
      "pre_shipment",
      "pre-shipment",
      "label_created",
      "printed"
    ].includes(code)
  ) {
    return "PRE_SHIPMENT";
  }

  if (/out for delivery/.test(combinedText)) {
    return "OUT_FOR_DELIVERY";
  }

  if (
    /return to sender|returned to sender|undeliverable|delivery exception|insufficient address|no access|delivery attempted|unable to deliver|delivery alert/.test(
      combinedText
    )
  ) {
    return "EXCEPTION";
  }

  if (
    /in transit|currently in transit|moving through|moving within|moving within the usps network|arrived at|departed|processed through|on its way to the next facility|in transit to the next facility/.test(
      combinedText
    )
  ) {
    return "IN_TRANSIT";
  }

  if (
    /accepted by usps|usps is in possession|usps in possession|picked up by usps|shipment received by usps/.test(
      combinedText
    )
  ) {
    return "ACCEPTED";
  }

  if (
    /your item was delivered|your package was delivered|has been delivered|was delivered at|delivered to an individual|delivered in\/at mailbox|delivered, left with individual|delivery completed/.test(
      combinedText
    )
  ) {
    return "DELIVERED";
  }

  if (
    /pre[- ]?shipment|label created|shipping label created|shipping label has been prepared|label has been prepared|printed|awaiting item|usps awaiting item|does not indicate receipt by the usps|does not indicate receipt by usps/.test(
      combinedText
    )
  ) {
    return "PRE_SHIPMENT";
  }

  return "UNKNOWN";
}

function getEventDescription(event) {
  return (
    event?.event_description ||
    event?.description ||
    event?.status_description ||
    event?.status ||
    ""
  );
}

function getEventDate(event) {
  return (
    event?.occurred_at ||
    event?.event_datetime ||
    event?.event_date_time ||
    event?.event_date ||
    event?.timestamp ||
    ""
  );
}

function getLatestEvent(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return null;
  }

  return [...events].sort((firstEvent, secondEvent) => {
    const firstDate = new Date(
      getEventDate(firstEvent) || 0
    ).getTime();

    const secondDate = new Date(
      getEventDate(secondEvent) || 0
    ).getTime();

    return secondDate - firstDate;
  })[0];
}

function buildLocation(event) {
  if (!event) {
    return "";
  }

  if (event.event_location) {
    return event.event_location;
  }

  if (event.location) {
    if (typeof event.location === "string") {
      return event.location;
    }

    return [
      event.location.city,
      event.location.state_province,
      event.location.postal_code,
      event.location.country_code
    ]
      .filter(Boolean)
      .join(", ");
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

function getTrackingEvents(trackingData) {
  if (Array.isArray(trackingData?.tracking_events)) {
    return trackingData.tracking_events;
  }

  if (Array.isArray(trackingData?.events)) {
    return trackingData.events;
  }

  return [];
}

async function getTracking(
  accessToken,
  trackingNumber
) {
  const trackingUrl = new URL(
    `${API_BASE.replace(/\/+$/, "")}/v1/tracking`
  );

  trackingUrl.searchParams.set(
    "carrier",
    "usps"
  );

  trackingUrl.searchParams.set(
    "tracking_number",
    trackingNumber
  );

  const response = await fetch(
    trackingUrl.toString(),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    }
  );

  const { data, responseText } =
    await parseResponse(response);

  if (!response.ok) {
    console.error(
      "Endicia tracking lookup failed",
      {
        requestUrl: trackingUrl.toString(),
        httpStatus: response.status,
        response: data || responseText,
        trackingNumber
      }
    );

    const errorMessage =
      data?.message ||
      data?.error?.message ||
      data?.error_description ||
      data?.error ||
      data?.errors?.[0]?.message;

    throw new Error(
      errorMessage ||
      `Endicia tracking lookup failed. HTTP ${response.status}`
    );
  }

  if (!data) {
    throw new Error(
      "Endicia returned an empty or unreadable tracking response."
    );
  }

  return data;
}

module.exports = async function handler(
  req,
  res
) {
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
      error:
        "A USPS tracking number is required."
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
    const accessToken =
      await getAccessToken();

    const trackingData =
      await getTracking(
        accessToken,
        trackingNumber
      );

    const events =
      getTrackingEvents(trackingData);

    const latestEvent =
      getLatestEvent(events);

    const latestEventDescription =
      getEventDescription(latestEvent);

    const rawStatus =
      trackingData?.carrier_status_description ||
      trackingData?.status_description ||
      trackingData?.status_code ||
      trackingData?.status ||
      latestEventDescription ||
      "Status unavailable";

    const normalizedStatus =
      normalizeStatus(
        trackingData?.status_code ||
          trackingData?.status,
        rawStatus,
        latestEventDescription
      );

    return sendJson(res, 200, {
      ok: true,

      trackingNumber:
        trackingData?.tracking_number ||
        trackingNumber,

      carrierName:
        trackingData?.carrier_name ||
        trackingData?.carrier ||
        "USPS",

      normalizedStatus,

      statusCode:
        trackingData?.status_code ||
        trackingData?.status ||
        "",

      rawStatus,

      estimatedDeliveryDate:
        trackingData?.estimated_delivery_date ||
        trackingData?.estimated_delivery ||
        "",

      latestEvent:
        latestEventDescription ||
        rawStatus,

      latestUpdate:
        getEventDate(latestEvent),

      latestLocation:
        buildLocation(latestEvent),

      trackingEvents:
        events
    });
  } catch (error) {
    console.error(
      "Connect America tracking error",
      error
    );

    return sendJson(res, 500, {
      ok: false,
      error:
        error?.message ||
        "Unable to retrieve the USPS tracking status."
    });
  }
};
