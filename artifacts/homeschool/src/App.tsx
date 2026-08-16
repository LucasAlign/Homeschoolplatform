import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/app-layout";
import DashboardPage from "@/pages/dashboard";
import CoursesPage from "@/pages/courses/index";
import NewCoursePage from "@/pages/courses/new";
import CourseDetailPage from "@/pages/courses/detail";
import EditCoursePage from "@/pages/courses/edit";
import LessonEditorPage from "@/pages/lessons/editor";
import NotFound from "@/pages/not-found";
import NewStudentPage from "@/pages/students/new";
import CurriculumSetupPage from "@/pages/students/curriculum";
import { ReactNode } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/students/new" component={NewStudentPage} />
          <Route path="/students/:id/curriculum" component={CurriculumSetupPage} />
          <Route path="/courses" component={CoursesPage} />
          <Route path="/courses/new" component={NewCoursePage} />
          <Route path="/courses/:id" component={CourseDetailPage} />
          <Route path="/courses/:id/edit" component={EditCoursePage} />
          <Route path="/courses/:id/lessons/:lessonId" component={LessonEditorPage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </AppLayout>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
