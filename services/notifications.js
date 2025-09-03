const twilio = require('twilio');

// Initialize Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const notificationService = {
  // Send SMS notification
  async sendSMS(to, message) {
    try {
      const result = await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: to
      });
      
      console.log(`SMS sent to ${to}: ${result.sid}`);
      return { success: true, sid: result.sid };
    } catch (error) {
      console.error('SMS error:', error);
      return { success: false, error: error.message };
    }
  },

  // Make automated call
  async makeCall(to, message) {
    try {
      const call = await client.calls.create({
        twiml: `<Response><Say voice="alice">${message}</Say></Response>`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: to
      });
      
      console.log(`Call made to ${to}: ${call.sid}`);
      return { success: true, sid: call.sid };
    } catch (error) {
      console.error('Call error:', error);
      return { success: false, error: error.message };
    }
  },

  // Notify officers about event assignment
  async notifyOfficersAssignment(event, officers) {
    const message = `You have been assigned to duty: ${event.name} on ${event.date.toDateString()} at ${event.startTime}. Location: ${event.location.name}. Please check your duty panel for details.`;
    
    const promises = officers.map(officer => 
      this.sendSMS(officer.phone, message)
    );

    const results = await Promise.allSettled(promises);
    return results;
  },

  // Notify about event start
  async notifyEventStart(event) {
    const message = `URGENT: Event "${event.name}" is starting now. Please check in immediately if you haven't already.`;
    
    const promises = event.officers
      .filter(officer => officer.status === 'assigned')
      .map(officer => this.sendSMS(officer.phone, message));

    const results = await Promise.allSettled(promises);
    return results;
  },

  // Send idle alert
  async sendIdleAlert(officer, event) {
    const message = `ALERT: You have been idle for more than 10 minutes during ${event.name}. Please resume active duty immediately.`;
    return await this.sendSMS(officer.phone, message);
  },

  // Send zone violation alert and call
  async sendZoneViolationAlert(officer, event) {
    const smsMessage = `URGENT: You are outside the designated zone for ${event.name}. Return to the assigned area immediately.`;
    const callMessage = `This is an urgent alert. You are currently outside the designated duty zone for ${event.name}. Please return to the assigned area immediately and contact your supervisor.`;
    
    // Send both SMS and call
    const smsResult = await this.sendSMS(officer.phone, smsMessage);
    const callResult = await this.makeCall(officer.phone, callMessage);
    
    return { sms: smsResult, call: callResult };
  },

  // Send emergency alert
  async sendEmergencyAlert(officer, event, location) {
    const message = `EMERGENCY ALERT: Officer ${officer.badgeNumber} (${officer.name}) has triggered an emergency alert at ${location.address || 'Unknown location'} during ${event.name}. Immediate assistance required.`;
    
    // Notify supervisor and other officers
    const supervisorPhone = '+1234567890'; // Get from supervisor profile
    const results = [];
    
    // Call supervisor immediately
    results.push(await this.makeCall(supervisorPhone, message));
    
    // SMS to nearby officers
    const nearbyOfficers = event.officers.filter(o => 
      o.userId !== officer.userId && 
      o.status === 'active'
    );
    
    for (const nearbyOfficer of nearbyOfficers) {
      results.push(await this.sendSMS(nearbyOfficer.phone, message));
    }
    
    return results;
  }
};

module.exports = notificationService;