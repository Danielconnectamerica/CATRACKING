// /api/subscribe.js
// Sends a customer tracking-notification enrollment to Power Automate.

const POWER_AUTOMATE_WEBHOOK_URL =
  process.env.SHEETS_WEBHOOK_URL;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return sendJson(res, 405, {
      ok: false,
      error: "Method not allowed."
    });
  }

  if (!POWER_AUTOMATE_WEBHOOK_URL) {
    return sendJson(res, 500, {
      ok: false,
      error:
        "SHEETS_WEBHOOK_URL is not configured in Vercel."
    });
  }

  const trackingNumber = String(
    req.body?.trackingNumber || ""
  )
    .replace(/\s+/g, "")
    .trim();

  const customerName = String(
    req.body?.customerName || ""
  ).trim();

  const customerEmail = String(
    req.body?.customerEmail || ""
  )
    .trim()
    .toLowerCase();

  const currentStatus = String(
    req.body?.currentStatus || ""
  )
    .trim()
    .toUpperCase();

  const customerConsent =
    req.body?.customerConsent === true;

  if (!trackingNumber) {
    return sendJson(res, 400, {
      ok: false,
      error: "A tracking number is required."
    });
  }

  if (!customerEmail) {
    return sendJson(res, 400, {
      ok: false,
      error: "The customer email address is required."
    });
  }

  if (!isValidEmail(customerEmail)) {
    return sendJson(res, 400, {
      ok: false,
      error: "Enter a valid customer email address."
    });
  }

  if (!currentStatus) {
    return sendJson(res, 400, {
      ok: false,
      error:
        "The current tracking status is required."
    });
  }

  if (!customerConsent) {
    return sendJson(res, 400, {
      ok: false,
      error:
        "Customer consent must be confirmed before enrollment."
    });
  }

  const enrollment = {
    trackingNumber,
    customerName,
    customerEmail,
    currentStatus,
    notificationEnabled: true,
    customerConsent: true,
    enrolledAt: new Date().toISOString(),
    source: "Connect America Tracking Lookup"
  };

  try {
    const response = await fetch(
      POWER_AUTOMATE_WEBHOOK_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(enrollment)
      }
    );

    const responseText = await response.text();

    if (!response.ok) {
      console.error(
        "Power Automate enrollment failed",
        {
          httpStatus: response.status,
          response: responseText
        }
      );

      return sendJson(res, 502, {
        ok: false,
        error:
          "Power Automate could not save the customer enrollment."
      });
    }

    return sendJson(res, 200, {
      ok: true,
      message:
        "Customer enrolled for shipment-status updates."
    });
  } catch (error) {
    console.error(
      "Connect America enrollment error",
      error
    );

    return sendJson(res, 500, {
      ok: false,
      error:
        "Unable to save the customer notification enrollment."
    });
  }
};
