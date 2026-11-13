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
        <li>Your yaps: the video or audio you record, plus the Yap score and tips worked out on your device, and any scripts you write.</li>
        <li>Usage data: pages visited and features used, collected with privacy-friendly analytics.</li>
      </ul>

      <h2>How we use it</h2>
      <p>
        To run your 30-day track, show your streaks and progress, and give feedback on your yaps. We don&apos;t sell your
        data, and we don&apos;t use your recordings to train AI models.
      </p>
      <p>
        <strong>Yap score (on your device).</strong> Pace, pauses, voice energy, eye contact and smile are measured in
        your browser while you record. Your video and audio are not uploaded for this. To check eye contact and smiles,
        your browser downloads a small face-tracking model (Google MediaPipe) once; the camera picture stays on your
        device. Only the resulting scores are saved with your yap.
      </p>
      <p>
        <strong>Follow my voice (optional).</strong> If you turn this teleprompter mode on, your browser&apos;s own speech
        recognition is used, which may send audio to Google (Chrome) or Apple (Safari).
      </p>
      <p>
        <strong>Coming later.</strong> Filler-word counts and AI coaching will send your recording&apos;s audio to a
        speech-to-text provider and the transcript to an AI model. We&apos;ll update this page before that starts.
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
