import SFConnection from "./sf-connection.js";
import FlowService from "./flow-service.js";

// UI Elements
const elements = {
  flowDownloadSection : document.getElementById("flowDownloadSection"),
  loader: document.getElementById("loader"),
  flowNameContainer: document.getElementById("flowNameContainer"),
  flowName: document.getElementById("flowName"),
  flowVersion: document.getElementById("flowVersion"),
  errorContainer: document.getElementById("errorContainer"),
  errorMessage: document.getElementById("errorMessage"),
  downloadBtn: document.getElementById("downloadJsonBtn"),
  copyBtn: document.getElementById("copyJsonBtn"),
  describeFlowBtn: document.getElementById("describeFlowBtn"),
  runAnalysisBtn: document.getElementById("runAnalysisBtn"),
  statusContainer: document.getElementById("statusContainer"),
  status: document.getElementById("status"),
  searchFlowSection: document.getElementById("searchFlowSection"),
  flowSearchInput: document.getElementById("flowSearchInput"),
  flowSearchResults: document.getElementById("flowSearchResults"),
  analysisContainer: document.getElementById("analysisContainer"),
  analysisTable: document.getElementById("analysisTable"),
  analysisResults: document.getElementById("analysisResults"),
  noIssues: document.getElementById("no-issues"),
};

let currentFlow = null;
let debounceTimeout = null;
let flowService = null;

function showError(message) {
  elements.loader.classList.add("hidden");
  elements.flowNameContainer.classList.add("hidden");
  elements.errorContainer.classList.remove("hidden");
  elements.errorMessage.textContent = message;
}

function showFlowInfo(flow) {
  elements.loader.classList.add("hidden");
  elements.errorContainer.classList.add("hidden");
  elements.flowNameContainer.classList.remove("hidden");

  elements.flowName.textContent = flow.MasterLabel || flow.FullName || "Unknown";
  elements.flowVersion.textContent = flow.VersionNumber || "-";

  elements.describeFlowBtn.disabled = false;
  elements.downloadBtn.disabled = false;
  elements.copyBtn.disabled = false;
  elements.runAnalysisBtn.disabled = false;
}

function showStatus(message, isSuccess = true) {
  elements.statusContainer.classList.remove("hidden");
  elements.status.classList.toggle("success", isSuccess);
  elements.status.classList.toggle("error", !isSuccess);
  elements.status.textContent = message;

  setTimeout(() => {
    elements.statusContainer.classList.add("hidden");
  }, 3000);
}

async function handleFlowSelection(flowVersionId) {
  try {
    currentFlow = await flowService.fetchFlow(flowVersionId);
    if (!currentFlow || !currentFlow.Metadata) throw new Error("Failed to load metadata.");
    showFlowInfo(currentFlow);
  } catch (e) {
    showError(e.message);
  }
}

async function openFlow(flowVersionId) {
  if (!flowVersionId) {
    console.error("Flow Version ID is required to open the flow.");
    return;
  }

  // Extract base URL from current window/tab
  const baseUrl = await flowService.baseUrl();

  // Construct the full Flow Builder URL
  const flowUrl = `${baseUrl}/builder_platform_interaction/flowBuilder.app?flowId=${flowVersionId}`;

  // Open in a new tab
  window.open(flowUrl, '_blank');
}


async function loadFlowVersions(flowId, flowName) {
  try {
    const versions = await flowService.fetchFlowVersions(flowId);
    elements.flowSearchResults.innerHTML = "";

    versions.forEach((version) => {
      const versionDiv = document.createElement("div");
      versionDiv.classList.add("flow-search-result");
    
      // Create a clickable element using a span instead of a button
      const versionText = document.createElement("span");
      versionText.classList.add("flow-version-text");
      versionText.textContent = `${flowName} (v${version.VersionNumber})`;
    
      // Add the click event listener to the span element
      versionText.addEventListener("click", () => openFlow(version.Id));
    
      versionDiv.appendChild(versionText);
      elements.flowSearchResults.appendChild(versionDiv);
    });
    
  } catch (error) {
    showError("Failed to load flow versions.");
    console.error(error);
  }
}

async function searchFlows(query) {
  try {
    const flowsNameIdMap = await flowService.fetchAllFlowDefinitions();

    if (!flowsNameIdMap || flowsNameIdMap.size === 0) {
      elements.flowSearchResults.innerHTML = "<p>No flows found.</p>";
      return;
    }

    const filteredEntries = [...flowsNameIdMap.entries()].filter(([name]) =>
      !query || name.toLowerCase().includes(query.toLowerCase())
    );

    if (filteredEntries.length === 0) {
      elements.flowSearchResults.innerHTML = "<p>No matching flows found.</p>";
      return;
    }

    elements.flowSearchResults.innerHTML = "";

    filteredEntries.forEach(([flowName, flowId]) => {
      const flowDiv = document.createElement("div");
      flowDiv.classList.add("flow-search-result");
    
      // Create a clickable span instead of a button
      const flowText = document.createElement("span");
      flowText.classList.add("flow-name-text");
      flowText.textContent = flowName;
    
      // Add the click event listener to the span element
      flowText.addEventListener("click", () => loadFlowVersions(flowId, flowName));
    
      flowDiv.appendChild(flowText);
      elements.flowSearchResults.appendChild(flowDiv);
    });
    
  } catch (error) {
    showError("Error searching flows.");
    console.error(error);
  }
}

async function initializePopup() {
  try {
    const connection = await new SFConnection().init();
    if (!connection) throw new Error("Failed to connect to Salesforce.");
    flowService = new FlowService(connection);

    const flowVersionId = await flowService.getFlowIdFromCurrentTab();
    if (!flowVersionId) {
      elements.searchFlowSection.style.display = "block";
      elements.flowDownloadSection.style.display = "none";
      searchFlows(elements.flowSearchInput.value.trim());
      elements.flowSearchInput.addEventListener("input", () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => searchFlows(elements.flowSearchInput.value.trim()), 500);
      });
      return;
    }

    await handleFlowSelection(flowVersionId);
    setupActionListeners();
  } catch (error) {
    showError(error.message);
  }
}

function setupActionListeners() {
  elements.downloadBtn.addEventListener("click", async () => {
    try {
      const success = await flowService.downloadMetadata(currentFlow);
      showStatus(success ? "Metadata downloaded." : "Download failed.", success);
    } catch (e) {
      showStatus(`Error: ${e.message}`, false);
    }
  });

  elements.copyBtn.addEventListener("click", async () => {
    try {
      const success = await flowService.copyMetadataToClipboard(currentFlow.Metadata);
      showStatus(success ? "Copied to clipboard." : "Copy failed.", success);
    } catch (e) {
      showStatus(`Error: ${e.message}`, false);
    }
  });

  elements.describeFlowBtn.addEventListener("click", () => {
    try {
      const success = flowService.describeThisFlow(currentFlow.Metadata);
      showStatus(success ? "Prompt copied to clipboard." : "Copy failed.", success);
    } catch (e) {
      showStatus(`Error: ${e.message}`, false);
    }
  });

  elements.runAnalysisBtn.addEventListener("click", () => {
    try {
      const issues = runFlowAnalysis(currentFlow.Metadata);
      displayFlowAnalysis(issues);
    } catch (e) {
      console.error("Analysis error:", e);
    }
  });
}

function runFlowAnalysis(metadata) {
  const issues = [];

  const dmlIssues = flowService.findDMLElementsInsideLoops(metadata);
  if (dmlIssues?.dmlElements?.length) {
    issues.push({
      issue: "DML Inside Loop",
      severity: "High",
      description: "DML operations inside loops detected.",
      elements: dmlIssues.dmlElements,
    });
  }

  const soqlIssues = flowService.findSOQLInsideLoops(metadata);
  if (soqlIssues?.recordLookups?.length) {
    issues.push({
      issue: "SOQL Inside Loop",
      severity: "High",
      description: "SOQL queries inside loops detected.",
      elements: soqlIssues.recordLookups,
    });
  }

  const hardcodedIds = flowService.findHardcodedIds(metadata);
  if (hardcodedIds.length) {
    issues.push({
      issue: "Hardcoded IDs",
      severity: "Medium",
      description: "Hardcoded record IDs detected.",
      elements: hardcodedIds,
    });
  }

  const unusedItems = Object.values(flowService.findUnusedItems(metadata)).flat();
  if (unusedItems.length) {
    issues.push({
      issue: "Unused Resources",
      severity: "Low",
      description: "Unused variables/templates found.",
      elements: unusedItems,
    });
  }

  return issues;
}

function displayFlowAnalysis(issues) {
  elements.analysisContainer.classList.remove("hidden");
  elements.analysisResults.innerHTML = "";
  elements.analysisTable.classList.add("hidden");
  elements.noIssues.classList.add("hidden");

  if (issues.length === 0) {
    elements.noIssues.classList.remove("hidden");
    return;
  }

  elements.analysisTable.classList.remove("hidden");

  issues.forEach((issue) => {
    const row = document.createElement("tr");
    row.classList.add(issue.severity.toLowerCase() + "-severity");

    const elementsList = issue.elements.map((e) => e.name || e).join(", ");
    row.innerHTML = `<td>${issue.issue}</td><td>${issue.description}</td><td>${elementsList}</td>`;
    elements.analysisResults.appendChild(row);
  });
}

document.addEventListener("DOMContentLoaded", initializePopup);