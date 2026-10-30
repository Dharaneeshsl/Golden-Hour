/**
 * Emergency Notification Service
 * 
 * Records break-glass emergency alert events.
 * Returns LOGGED_ONLY until a production SMS/telephony provider (e.g. Twilio/Karix) is integrated.
 */

class NotificationService {
  constructor() {
    this.outbox = [];
  }

  async sendEmergencyAlert({ patientId, patientPhone, emergencyContact, doctorName, facility, reasonCode }) {
    const timestamp = new Date().toISOString();
    const alertMessage = `🚨 URGENT: GoldenHour Emergency Access triggered for your medical record at ${facility || "Emergency Facility"} by ${doctorName || "Verified Clinician"}. Reason: ${reasonCode || "TRAUMA_UNRESPONSIVE"}. If this was unauthorized, contact hospital administration immediately.`;

    const notifications = [
      {
        id: `notif-${Date.now()}-1`,
        patientId,
        recipient: patientPhone || "Patient Primary Channel",
        type: "SMS",
        message: alertMessage,
        status: "LOGGED_ONLY",
        timestamp,
      },
    ];

    if (emergencyContact) {
      notifications.push({
        id: `notif-${Date.now()}-2`,
        patientId,
        recipient: emergencyContact,
        type: "SMS",
        message: `🚨 ALERT: Your registered emergency contact's medical history was accessed during trauma triage at ${facility || "Emergency Facility"}. Reason: ${reasonCode || "TRAUMA_UNRESPONSIVE"}.`,
        status: "LOGGED_ONLY",
        timestamp,
      });
    }

    this.outbox.push(...notifications);
    console.log(`[NotificationService] Logged ${notifications.length} emergency alerts for patient ${patientId} (status: LOGGED_ONLY - SMS gateway pending)`);
    return notifications;
  }

  getRecentNotifications(patientId) {
    return this.outbox.filter((n) => !patientId || n.patientId === patientId);
  }
}

module.exports = {
  NotificationService,
  notificationService: new NotificationService(),
};
