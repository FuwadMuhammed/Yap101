import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms · Yap101" };

export default function Terms() {
  return (
    <LegalPage title="Terms" updated="8 November 2026">
      <h2>The beta</h2>
      <p>
        Yap101 is in a free beta. Features may change, and the free plan is limited to 3 yaps a day. We&apos;ll tell you
        before anything you rely on changes in a big way.
      </p>

      <h2>Your content</h2>
      <p>
        You own your recordings. You give us permission to store and process them only to run the app for you, including
        generating feedback. Posting a clip elsewhere is your choice and your responsibility.
      </p>

      <h2>Fair use</h2>
      <ul>
        <li>Only record yourself, or people who agreed to be recorded.</li>
        <li>No illegal, hateful or harassing content.</li>
        <li>Don&apos;t try to break, overload or reverse-engineer the service.</li>
      </ul>

      <h2>Feedback is guidance</h2>
      <p>
        The Yap score and tips are worked out automatically and can be wrong. Use it as coaching, not as professional advice.
      </p>

      <h2>No guarantees</h2>
      <p>
        The service is provided as is during the beta. We can&apos;t promise it will always be available or error-free.
        You can stop using it and delete your data at any time.
      </p>

      <h2>Contact</h2>
      <p>[Company name] · [contact email]</p>
    </LegalPage>
  );
}
