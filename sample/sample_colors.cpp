// sample_colors.cpp
// Open this file with the ImVec4 Color Swatch extension enabled to see
// swatches next to every literal below.

#include "imgui.h"

// --- Constructor style, float 0.0-1.0 -------------------------------------
static const ImVec4 kAccentBlue = ImVec4(0.20f, 0.55f, 0.95f, 1.0f);
static const ImVec4 kWarningOrange = ImVec4(1.0f, 0.65f, 0.0f, 1.0f);
static const ImVec4 kTransparentRed = ImVec4(0.9f, 0.1f, 0.1f, 0.35f);

// --- Constructor style, no 'f' suffix, extra whitespace --------------------
static const ImVec4 kLooseSpacing = ImVec4( 0.10 , 0.20 ,0.30,  0.40 );

// --- Brace-init style --------------------------------------------------
static const ImVec4 kBraceFloat = ImVec4{0.4f, 0.8f, 0.2f, 1.0f};

// --- Declaration form: Type name = { ... }; ---------------------------
ImVec4 buttonIdleColor = { 60, 60, 60, 255 };
ImVec4 buttonHoverColor = { 90, 90, 90, 255 };
ImVec4 buttonActiveColor = { 30, 30, 30, 255 };

// --- Trailing comma before closing bracket -----------------------------
static const ImVec4 kTrailingComma = ImVec4{1.0f, 1.0f, 1.0f, 1.0f,};

// --- Multiple matches on one line --------------------------------------
void PushTwoColors() {
  ImGui::PushStyleColor(ImGuiCol_Text, ImVec4(1, 1, 1, 1));
  ImGui::PushStyleColor(ImGuiCol_WindowBg, ImVec4{20, 20, 20, 255});
}

void ApplyTheme() {
  ImGui::PushStyleColor(ImGuiCol_Button, buttonIdleColor);
  ImGui::PushStyleColor(ImGuiCol_ButtonHovered, buttonHoverColor);
  ImGui::PushStyleColor(ImGuiCol_ButtonActive, buttonActiveColor);
  ImGui::PushStyleColor(ImGuiCol_Text, kAccentBlue);
  ImGui::PopStyleColor(4);
}
