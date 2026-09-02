import type { Metadata } from "next";

import { LegalDocument } from "@/components/marketing/legal-document";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How LTX Studio handles data — a self-hosted front-end for the LTX-2.5 generation API that keeps your content on your own infrastructure.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      updated="1 September 2026"
      intro="LTX Studio is a self-hosted web interface for the LTX-2.5 video generation API. It is designed so that your prompts, media and credentials stay on infrastructure you control. This policy explains what the application stores, where, and why."
      sections={[
        {
          heading: "1. No telemetry, no cloud",
          paragraphs: [
            "LTX Studio does not include analytics, tracking scripts, advertising or crash-reporting services. The application makes no outbound network requests except those required to reach the generation API server you configure yourself.",
          ],
        },
        {
          heading: "2. Data stored in your browser",
          paragraphs: [
            "The studio is fully client-side. The following information is stored in your browser's local storage and never leaves your device except when sent to the API server you have configured:",
          ],
          bullets: [
            "The base URL of your LTX-2.5 API server.",
            "Your API key, used as an X-API-Key header to authenticate requests to that server.",
            "Interface preferences such as your selected theme.",
          ],
        },
        {
          heading: "3. Data processed by your server",
          paragraphs: [
            "Prompts, reference images, generation settings, job status, logs and rendered videos are submitted to, processed by and stored on the LTX-2.5 API server you connect to. That server, its operator and its storage are outside the scope of this interface; please consult the operator of the deployment you use for details on retention and deletion.",
            "When running your own deployment, all of this data remains on your own hardware and is subject to your own operational policies.",
          ],
        },
        {
          heading: "4. Third-party models",
          paragraphs: [
            "The underlying LTX-2.5 model and its companion text encoders may be downloaded from public model repositories (such as Hugging Face) when your server initializes. Your server's IP address and model download activity may be visible to those providers, as with any HTTP download. No prompts or generated media are transmitted to model providers at generation time.",
          ],
        },
        {
          heading: "5. Security",
          paragraphs: [
            "API keys are transmitted with every request to your configured server. Use HTTPS between your browser and the API server whenever the connection leaves a trusted network, and store the server's admin key securely. Anyone with access to your browser profile can read locally stored settings, so avoid using shared computers.",
          ],
        },
        {
          heading: "6. Changes to this policy",
          paragraphs: [
            "This policy may be updated as the application evolves. Material changes will be reflected in the “last updated” date above.",
          ],
        },
        {
          heading: "7. Contact",
          paragraphs: [
            "For questions about this policy, contact the operator of the LTX Studio deployment you are using.",
          ],
        },
      ]}
    />
  );
}
