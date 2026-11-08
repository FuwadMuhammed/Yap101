import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy · Yap101" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy" updated="8 November 2026">
      <h2>The short version</h2>
      <ul>
        <li>Your recordings are private. Only you can see them.</li>
        <li>Nothing is posted anywhere unless you share it yourself.</li>
        <li>You can delete any yap, any time, from My yaps.</li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li>Your account: email address, and your name and photo if you sign in with Google.</li>
        <li>Your answers from setup: niche, platform, level, goal and preferred yap time.</li>
        <li>Your yaps: the video or audio you record, plus the transcript and feedback we generate.</li>
        <li>Usage data: pages visited and features used, collected with privacy-friendly analytics.</li>
      </ul>

      <h2>How we use it</h2>
      <p>
        To run your 30-day track, show your streaks and progress, and give feedback on your yaps. To give feedback, your
        recording&apos;s audio is sent to a speech-to-text provider and the transcript to an AI model. We don&apos;t sell
        your data, and we don&apos;t use your recordings to train AI models.
      </p>

      <h2>Where it&apos;s stored</h2>
      <p>
        Recordings are kept in private storage that only your account can access. In demo mode, everything stays in your
        own browser and never reaches our servers.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Delete a yap from My yaps. It&apos;s removed from storage straight away.</li>
        <li>Ask us to delete your whole account and data at [contact email].</li>
      </ul>

      <h2>Contact</h2>
      <p>[Company name] · [contact email]</p>
    </LegalPage>
  );
}
