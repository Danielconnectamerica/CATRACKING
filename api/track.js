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

  /*
   * First use Endicia's actual status code whenever available.
   * This is safer than searching the full description for individual words.
   */

  if (
    [
      "delivered"
    ].includes(code)
  ) {
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

  /*
   * Fall back to the carrier description only when the status code
   * does not map to one of the known values.
   */

  if (
    /out for delivery/.test(combinedText)
  ) {
    return "OUT_FOR_DELIVERY";
  }

  if (
    /return to sender|returned to sender|undeliverable|delivery exception|insufficient address|no access|delivery attempted|unable to deliver/.test(
      combinedText
    )
  ) {
    return "EXCEPTION";
  }

  /*
   * Check in-transit wording before delivered wording.
   * This prevents phrases such as "on track to be delivered"
   * from being mistaken for an actual delivery.
   */

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

  /*
   * Only classify as delivered when the wording confirms a completed
   * delivery—not when it says "expected to be delivered" or
   * "on track to be delivered."
   */

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
