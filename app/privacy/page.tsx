export const metadata = { title: "Privacy" };
export default function Page() {
  return <main id="main" className="shell prose-page">
    <p className="eyebrow">YOUR INFORMATION</p><h1>Privacy</h1>
    <p>Alhena Research Lab is operated by Alhena. We use your work email to verify access to detailed reports. New comparison requests also require your name and work email so we can review the request and send approval and completion updates.</p>
    <h2>Report access</h2>
    <p>Report summaries and the scoring rubric are public. Detailed conversations, scoring decisions and evidence downloads require a verified work email address. When you view or download a detailed report, we record the report, action, time and your verified account. We notify Alhena’s operator with the report title and your email address. Repeated notifications for the same report and action are limited. This is disclosed before verification; accessing a report does not sign you up for a marketing mailing list.</p>
    <h2>What is shared</h2>
    <p>Published reports contain provider and storefront names, test conversations, scoring decisions and evaluation limitations. Your name, email, verification code, report-access history and private review notes are not included in reports or public summaries. The initial report was published before email gating, and copies may remain publicly available outside this website.</p>
    <h2>What we store</h2>
    <p>We store your verified contact information, detailed-report access events, submitted comparisons, request history and email delivery records. Verification codes expire after ten minutes. We retain reports as an evidence record. Account and request data is retained until the operator deletes it; request deletion by emailing <a href="mailto:ashu@alhena.ai">ashu@alhena.ai</a>.</p>
    <h2>How evaluations work</h2>
    <p>New tests use public storefronts in separate browser sessions. Compatible previously published analysis may be reused only within 30 days of capture, with its original test date, source and limitations disclosed. We do not provide your identity to storefront chat agents. Evaluation transcripts may be processed by the configured AI model provider for judging and auditing. Transactional emails are delivered through the configured email service.</p>
    <h2>Cookies</h2>
    <p>We use an essential session cookie after email verification. The application does not include advertising trackers. Verification confirms access to a mailbox; it does not verify your employer or authority to represent a company.</p>
    <p className="muted">Last updated September 20, 2026.</p>
  </main>;
}
