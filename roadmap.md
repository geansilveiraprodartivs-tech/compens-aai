# Roadmap

- [x] Implement atomic one-trial-per-verified-mobile eligibility and SMS confirmation with Twilio Verify. Preserve paid access and existing trial expiry times. Unit and subscription regression tests passed.
- [ ] Confirm the real SMS sent to the owner's mobile and then enable MOBILE_TRIAL_REQUIRED. The authenticated Profile flow successfully sent a real SMS; activation waits for the owner's confirmation code. Do not claim production activation or verified delivery until confirmation succeeds.