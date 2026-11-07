# Roadmap

- [ ] Implement atomic one-trial-per-verified-mobile eligibility and SMS confirmation with Twilio Verify. Preserve paid access and existing trial expiry times.
- [ ] Test real SMS delivery and confirmation, then enable the mandatory verification gate. Activation waits for the owner's SMS code; never invent verification.
- [ ] Resolve published-runtime egress failure to verify.twilio.com (fetch_failed TypeError, ~50-90ms; dev runtime succeeds with same code/credentials). Awaits Lovable support answer on egress policy — user's ticket drafted; no project-side setting exists.