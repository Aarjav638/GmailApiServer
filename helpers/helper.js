import listMessages, { authorize } from "../Controllers/Email.js";
import OpenAIClient from "../constants/OpenAi.js";

const extractPolicyDetails = async (text) => {
  const prompt = `
    Extract the following information from the given text and return it in valid JSON format. If any field is not present, use N/A as the value. Extract these fields:
    - name: The name of the policyholder or relevant entity.
    - policy_number: The unique policy identifier.
    - policy_category: The type or category of the policy (e.g., health, life, auto).
    - issuer_name: The organization or issuer of the policy.
    - start_date: The policy's start date.
    - end_date: The policy's end date (if applicable).
    - premium_amount: The amount of the premium (if stated).
    - coverage_amount: The coverage amount provided by the policy.
    - contact_info: Any contact details (phone, email, or address)
  
    Text: ${text}
  
    Return only valid JSON Format
    `;

  try {
    const response = await OpenAIClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that extracts policy details from text.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const rawOutput = response.choices[0].message.content;
    const jsonMatch = rawOutput.match(/\{.*\}/s);
    if (jsonMatch) {
      const extractedJson = jsonMatch[0].trim();
      try {
        const parsedJson = JSON.parse(extractedJson);
        return parsedJson;
      } catch (parseError) {
        console.error("Error parsing JSON:", parseError.message);
        return null;
      }
    } else {
      throw new Error("No valid JSON block found in the response.");
    }
  } catch (error) {
    console.error("Error extracting policy details:", error.message);
    return null;
  }
};

const extractData = async () => {
  let extractedData = [];
  try {
    const response = await authorize().then(listMessages);
    const attachmentMails = response.attachmentMails;
    const normalMails = response.normalMails;
    for (const mail of attachmentMails) {
      const { id, body, attachments } = mail;

      const extractedDetails = await extractPolicyDetails(body);
      const messageId = id;
      if (attachments) {
        for (const attachment of attachments) {
          const { body, attachmentType, filename } = attachment;
          const extractedAttachmentDetails = await extractPolicyDetails(body);
          extractedData.push({
            messageId,
            attachmentType,
            filename,
            extractedDetails: extractedAttachmentDetails,
          });
        }
      }
      extractedData.push({ messageId, extractedDetails });
    }
    for (const mail of normalMails) {
      const { id, body } = mail;
      const extractedDetails = await extractPolicyDetails(body);
      const messageId = id;
      extractedData.push({ messageId, extractedDetails });
    }
    return extractedData;
  } catch (error) {
    console.error("Error listing messages:", error.message);
    return error.message;
  }
};

export default extractData;
