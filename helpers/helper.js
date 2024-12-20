import listMessages, { authorize } from "../Controllers/Email.js";
import OpenAIClient from "../constants/OpenAi.js";

let extractedData = [];
const processedAttachments = new Set();
const processedMessageBodies = new Set();

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
          content: "You are a helpful assistant that extracts policy details from text.",
        },
        { role: "user", content: prompt },
      ],
    });

    const rawOutput = response.choices[0].message.content;
    const jsonMatch = rawOutput.match(/\{.*\}/s);
    if (jsonMatch) {
      const extractedJson = jsonMatch[0].trim();
      return JSON.parse(extractedJson);
    } else {
      console.error("No valid JSON block found in the response.");
      return null;
    }
  } catch (error) {
    console.error("Error extracting policy details:", error.message);
    return null;
  }
};

const addToExtractedData = (data) => {
  const isDuplicate = extractedData.some((item) =>
    data.customId
      ? item.customId === data.customId
      : item.messageId === data.messageId
  );

  if (!isDuplicate) {
    extractedData.push(data);
  } else {
    console.log("Duplicate detected. Skipping:", data);
  }
};

const processMailAttachments = async (attachments, messageId) => {
  for (const attachment of attachments) {
    const { body, attachmentType, filename, attachmentId } = attachment;
    const customId = `${messageId}-${filename}`.toLowerCase().trim();

    if (!processedAttachments.has(customId)) {
      processedAttachments.add(customId);

      const extractedDetails = await extractPolicyDetails(body);
      addToExtractedData({
        messageId,
        customId,
        attachmentType,
        filename,
        attachmentId,
        extractedDetails,
      });
    } else {
      console.log("Skipping duplicate attachment:", customId);
    }
  }
};

const processMailBody = async (body, messageId) => {
  if (!processedMessageBodies.has(messageId)) {
    processedMessageBodies.add(messageId);

    const extractedDetails = await extractPolicyDetails(body);
    addToExtractedData({ messageId, extractedDetails });
  } else {
    console.log("Skipping duplicate message body:", messageId);
  }
};

const extractData = async () => {
  try {
    const response = await authorize().then(listMessages);
    if (!response) return "No emails found.";

    const { attachmentMails, normalMails } = response;

    for (const mail of attachmentMails) {
      const { id: messageId, body, attachments } = mail;

      await processMailBody(body, messageId);
      if (attachments) {
        await processMailAttachments(attachments, messageId);
      }
    }

    for (const mail of normalMails) {
      const { id: messageId, body } = mail;
      await processMailBody(body, messageId);
    }

    return extractedData;
  } catch (error) {
    console.error("Error listing messages:", error.message);
    return error.message;
  }
};

export default extractData;
