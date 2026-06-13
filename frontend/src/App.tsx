import { Navigate, Route, BrowserRouter, Routes, useParams } from "react-router-dom";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AdminPage } from "@/pages/AdminPage";
import { DiaryEditorPage } from "@/pages/DiaryEditorPage";
import { HomePage } from "@/pages/HomePage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SignInPage } from "@/pages/SignInPage";
import { SignUpPage } from "@/pages/SignUpPage";
import { ViewDiariesPage } from "@/pages/ViewDiariesPage";
import { RequireAuth, RequireGuest, RequireRole } from "@/routes/guards";

/** Forces a full remount when navigating between two existing diaries (same matched route, different `:id`) — `DiaryEditorPage` owns per-diary state that must not bleed across ids. */
function DiaryEditorRoute() {
  const { id } = useParams<{ id: string }>();
  return <DiaryEditorPage key={id} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route index element={<Navigate to="/home" replace />} />

            <Route element={<RequireGuest />}>
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/signup" element={<SignUpPage />} />
            </Route>

            <Route element={<RequireAuth />}>
              <Route element={<DashboardShell />}>
                <Route path="/home" element={<HomePage />} />
                <Route path="/diaries" element={<ViewDiariesPage />} />
                <Route path="/diary/new" element={<DiaryEditorPage />} />
                <Route path="/diary/:id" element={<DiaryEditorRoute />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/settings" element={<SettingsPage />} />

                <Route element={<RequireRole role="ADMIN" />}>
                  <Route path="/admin" element={<AdminPage />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
