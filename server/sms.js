/**
 * SMS verification code module.
 *
 * Uses Tencent Cloud SMS service.
 * In development mode, codes are logged to console instead of sent.
 */

import crypto from "node:crypto";

/**
 * Send SMS verification code.
 *
 * In production: calls Tencent Cloud SMS API.
 * In development: logs code to console (no SMS sent).
 *
 * @param {string} phone - Phone number (e.g., "13800138000")
 * @param {string} code - 6-digit verification code
 * @returns {Promise<boolean>} - true if sent successfully
 */
export async function sendSmsCode(phone, code) {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[SMS-DEV] Verification code for ${phone}: ${code}`);
    console.log(`[SMS-DEV] In dev mode, use code "000000" to bypass verification.`);
    return true;
  }

  const secretId = process.env.TENCENT_SMS_SECRET_ID;
  const secretKey = process.env.TENCENT_SMS_SECRET_KEY;
  const sdkAppId = process.env.TENCENT_SMS_SDK_APP_ID;
  const signName = process.env.TENCENT_SMS_SIGN_NAME;
  const templateId = process.env.TENCENT_SMS_TEMPLATE_ID;

  if (!secretId || !secretKey || !sdkAppId) {
    console.error("[SMS] Tencent SMS not configured. Code:", code);
    return false;
  }

  // Tencent Cloud SMS API v3
  const host = "sms.tencentcloudapi.com";
  const service = "sms";
  const action = "SendSms";
  const version = "2021-01-11";
  const timestamp = Math.floor(Date.now() / 1000);

  const payload = JSON.stringify({
    SmsSdkAppId: sdkAppId,
    SignName: signName,
    TemplateId: templateId,
    TemplateParamSet: [code, "5"], // code + expiry minutes
    PhoneNumberSet: [`+86${phone}`],
  });

  // TC3-HMAC-SHA256 signature
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const credentialScope = `${date}/${service}/tc3_request`;

  const hashedPayload = crypto.createHash("sha256").update(payload).digest("hex");
  const canonicalRequest = [
    "POST",
    "/",
    "",
    `content-type:application/json\nhost:${host}\n`,
    "content-type;host",
    hashedPayload,
  ].join("\n");

  const stringToSign = [
    "TC3-HMAC-SHA256",
    timestamp,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();
  const secretDate = hmac(`TC3${secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = crypto.createHmac("sha256", secretSigning).update(stringToSign).digest("hex");

  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`;

  try {
    const resp = await fetch(`https://${host}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
        Host: host,
        "X-TC-Action": action,
        "X-TC-Version": version,
        "X-TC-Timestamp": String(timestamp),
      },
      body: payload,
    });

    const data = await resp.json();
    if (data.Response && data.Response.SendStatusSet) {
      const status = data.Response.SendStatusSet[0];
      if (status.Code === "Ok") {
        console.log(`[SMS] Code sent to ${phone}`);
        return true;
      }
      console.error(`[SMS] Failed:`, status.Message);
    } else if (data.Response && data.Response.Error) {
      console.error(`[SMS] API Error:`, data.Response.Error.Message);
    }
    return false;
  } catch (err) {
    console.error(`[SMS] Network error:`, err.message);
    return false;
  }
}
