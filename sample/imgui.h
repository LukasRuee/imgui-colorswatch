// Minimal stand-in for imgui.h, just enough for the sample to read naturally
// as real ImGui-style code. Not a functional ImGui build.
#pragma once

struct ImVec4 {
  float x, y, z, w;
  ImVec4(float _x = 0, float _y = 0, float _z = 0, float _w = 0) : x(_x), y(_y), z(_z), w(_w) {}
};

enum ImGuiCol_ { ImGuiCol_Text, ImGuiCol_WindowBg, ImGuiCol_Button, ImGuiCol_ButtonHovered, ImGuiCol_ButtonActive };

namespace ImGui {
  void PushStyleColor(int idx, const ImVec4& col);
  void PopStyleColor(int count = 1);
}
