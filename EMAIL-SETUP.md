# Lead alerts and client emails

## Lead alerts to you (Netlify, free)
Netlify → valuemyprop → **Forms** → **Form notifications** → Add notification → **Email notification** → event *New form submission*, form `valuation-lead`, your email.
Each lead includes all answers, the estimate, and `whatsapp_client_link` — tap it to open WhatsApp with the client and their valuation pre-written.

## Valuation emailed to the client (EmailJS, free 200 emails/month)
1. Sign up at **emailjs.com**.
2. **Email Services → Add New Service** → Gmail or Outlook 365 → connect your email → copy the **Service ID**.
3. **Email Templates → Create New Template**:
   - Subject: `Your {{valuation_type}}: {{estimate}}`
   - To Email: `{{to_email}}` · From Name: `valuemyprop` · Reply To: your email · **Bcc: your email**
   - Content → Edit content → **Code editor** → paste everything from `emailjs-template.html` → Save → copy the **Template ID**.
4. **Account → General** → copy the **Public Key**.
5. On GitHub, edit `public/config.js` and fill in:
   ```js
   emailjs: { serviceId: "service_…", templateId: "template_…", publicKey: "…" },
   ```
   Commit — Netlify redeploys and client emails start.
