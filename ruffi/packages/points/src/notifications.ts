// @steered SNARE-2 2026-09-29

import { getLocalCredential } from "./providers/localCredentials.ts";
import type { NotificationPreferences, WatchAlert } from "./types.ts";

export type NotificationDelivery = {
  channel: "email" | "sms";
  delivered: boolean;
  message: string;
};

async function sendEmail(alert: WatchAlert, to: string): Promise<NotificationDelivery> {
  const apiKey = await getLocalCredential("resend_api_key");
  const from = process.env.RUFFI_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    return {
      channel: "email",
      delivered: false,
      message: "Add resend_api_key to the protected Ruffi credential file and set RUFFI_FROM_EMAIL.",
    };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: alert.title,
        text: `${alert.message}\n\nOpen Ruffi on your local computer to review the redemption.`,
      }),
    });
    return {
      channel: "email",
      delivered: response.ok,
      message: response.ok ? "Email sent." : `Email provider returned ${response.status}.`,
    };
  } catch {
    return { channel: "email", delivered: false, message: "Email provider could not be reached." };
  }
}

async function sendSms(alert: WatchAlert, to: string): Promise<NotificationDelivery> {
  const accountSid = await getLocalCredential("twilio_account_sid");
  const authToken = await getLocalCredential("twilio_auth_token");
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!accountSid || !authToken || !from) {
    return {
      channel: "sms",
      delivered: false,
      message:
        "Add Twilio credentials to the protected Ruffi credential file and set TWILIO_FROM_NUMBER.",
    };
  }
  try {
    const body = new URLSearchParams({
      To: to,
      From: from,
      Body: `${alert.title}: ${alert.message}`.slice(0, 1200),
    });
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );
    return {
      channel: "sms",
      delivered: response.ok,
      message: response.ok ? "Text sent." : `Text provider returned ${response.status}.`,
    };
  } catch {
    return { channel: "sms", delivered: false, message: "Text provider could not be reached." };
  }
}

export async function deliverAlert(
  alert: WatchAlert,
  preferences: NotificationPreferences
): Promise<NotificationDelivery[]> {
  const deliveries: Promise<NotificationDelivery>[] = [];
  if (preferences.emailEnabled && preferences.email) {
    deliveries.push(sendEmail(alert, preferences.email));
  }
  if (preferences.smsEnabled && preferences.phone) {
    deliveries.push(sendSms(alert, preferences.phone));
  }
  return Promise.all(deliveries);
}
