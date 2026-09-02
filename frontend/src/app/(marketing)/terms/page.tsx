import type { Metadata } from "next";

import { LegalDocument } from "@/components/marketing/legal-document";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms governing the use of LTX Studio, a self-hosted front-end for the LTX-2.5 video generation API.",
};

export default function TermsOfServicePage() {
  return (
    <LegalDocument
      title="Terms of Service"
      updated="1 September 2026"
      intro="These terms govern your use of LTX Studio, a self-hosted web interface for the LTX-2.5 video generation API. By using the application you agree to these terms. If you do not agree, do not use the application."
      sections={[
        {
          heading: "1. The service",
          paragraphs: [
            "LTX Studio provides an interface for submitting video generation jobs to an LTX-2.5 API server. The application itself hosts no content and performs no generation; all rendering is performed by the server instance you configure.",
            "The operator of the server you connect to may impose additional rules, quotas or access controls. Those rules are between you and that operator.",
          ],
        },
        {
          heading: "2. Acceptable use",
          paragraphs: ["You agree not to use the service to generate content that:"],
          bullets: [
            "Is unlawful in your jurisdiction or the jurisdiction of the server operator.",
            "Sexually exploits or endangers minors.",
            "Deliberately misleads about its origin in a way that causes harm (for example, non-consensual impersonation or fraudulent media).",
            "Infringes the intellectual property or other rights of others.",
            "Attempts to disrupt, overload or gain unauthorized access to the API server or any other system.",
          ],
        },
        {
          heading: "3. Your content",
          paragraphs: [
            "You retain ownership of the prompts, reference images and videos you submit and generate. You are responsible for ensuring you have the necessary rights to the materials you upload and for your use of the generated output.",
            "Because the application is self-hosted, your content is stored on the server you connect to; deletion, retention and backup are governed by that server's configuration.",
          ],
        },
        {
          heading: "4. Model licenses",
          paragraphs: [
            "Generated output is produced by the LTX-2.5 model and companion models running on your server. Your use of that output may additionally be subject to the licenses of those models. Review the applicable model licenses before commercial use.",
          ],
        },
        {
          heading: "5. Availability and warranty",
          paragraphs: [
            "The application is provided “as is”, without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose and non-infringement. Generation quality, speed and availability depend entirely on your hardware and server configuration.",
          ],
        },
        {
          heading: "6. Limitation of liability",
          paragraphs: [
            "To the maximum extent permitted by law, the authors and contributors of LTX Studio shall not be liable for any indirect, incidental, special, consequential or punitive damages, or any loss of data, profits or revenue, arising from your use of the application — even if advised of the possibility of such damages.",
          ],
        },
        {
          heading: "7. Changes to these terms",
          paragraphs: [
            "These terms may be updated from time to time. Continued use of the application after changes are published constitutes acceptance of the revised terms. The “last updated” date above reflects the current version.",
          ],
        },
        {
          heading: "8. Contact",
          paragraphs: [
            "For questions about these terms, contact the operator of the LTX Studio deployment you are using.",
          ],
        },
      ]}
    />
  );
}
