import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { Course, CourseDetail, CourseInput, CourseUpdate, CourseWithCounts, DashboardSummary, ErrorResponse, HealthStatus, Lesson, LessonDetail, LessonInput, LessonUpdate, PublishToggle, Unit, UnitInput } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * @summary Health check
 */
export declare const healthCheck: (options?: Parameters<typeof customFetch>[1]) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDashboardUrl: () => string;
/**
 * @summary Get dashboard summary
 */
export declare const getDashboard: (options?: Parameters<typeof customFetch>[1]) => Promise<DashboardSummary>;
export declare const getGetDashboardQueryKey: () => readonly ["/api/dashboard"];
export declare const getGetDashboardQueryOptions: <TData = Awaited<ReturnType<typeof getDashboard>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboard>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDashboard>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDashboardQueryResult = NonNullable<Awaited<ReturnType<typeof getDashboard>>>;
export type GetDashboardQueryError = ErrorType<unknown>;
/**
 * @summary Get dashboard summary
 */
export declare function useGetDashboard<TData = Awaited<ReturnType<typeof getDashboard>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboard>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListCoursesUrl: () => string;
/**
 * @summary List all courses
 */
export declare const listCourses: (options?: Parameters<typeof customFetch>[1]) => Promise<CourseWithCounts[]>;
export declare const getListCoursesQueryKey: () => readonly ["/api/courses"];
export declare const getListCoursesQueryOptions: <TData = Awaited<ReturnType<typeof listCourses>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCourses>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listCourses>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListCoursesQueryResult = NonNullable<Awaited<ReturnType<typeof listCourses>>>;
export type ListCoursesQueryError = ErrorType<unknown>;
/**
 * @summary List all courses
 */
export declare function useListCourses<TData = Awaited<ReturnType<typeof listCourses>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCourses>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateCourseUrl: () => string;
/**
 * @summary Create a new course
 */
export declare const createCourse: (courseInput: CourseInput, options?: Parameters<typeof customFetch>[1]) => Promise<Course>;
export declare const getCreateCourseMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCourse>>, TError, {
        data: BodyType<CourseInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createCourse>>, TError, {
    data: BodyType<CourseInput>;
}, TContext>;
export type CreateCourseMutationResult = NonNullable<Awaited<ReturnType<typeof createCourse>>>;
export type CreateCourseMutationBody = BodyType<CourseInput>;
export type CreateCourseMutationError = ErrorType<unknown>;
/**
* @summary Create a new course
*/
export declare const useCreateCourse: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCourse>>, TError, {
        data: BodyType<CourseInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createCourse>>, TError, {
    data: BodyType<CourseInput>;
}, TContext>;
export declare const getGetCourseUrl: (id: string) => string;
/**
 * @summary Get a course by ID with units and lessons
 */
export declare const getCourse: (id: string, options?: Parameters<typeof customFetch>[1]) => Promise<CourseDetail>;
export declare const getGetCourseQueryKey: (id: string) => readonly [`/api/courses/${string}`];
export declare const getGetCourseQueryOptions: <TData = Awaited<ReturnType<typeof getCourse>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCourse>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getCourse>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetCourseQueryResult = NonNullable<Awaited<ReturnType<typeof getCourse>>>;
export type GetCourseQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get a course by ID with units and lessons
 */
export declare function useGetCourse<TData = Awaited<ReturnType<typeof getCourse>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCourse>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateCourseUrl: (id: string) => string;
/**
 * @summary Update a course
 */
export declare const updateCourse: (id: string, courseUpdate: CourseUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<Course>;
export declare const getUpdateCourseMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateCourse>>, TError, {
        id: string;
        data: BodyType<CourseUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateCourse>>, TError, {
    id: string;
    data: BodyType<CourseUpdate>;
}, TContext>;
export type UpdateCourseMutationResult = NonNullable<Awaited<ReturnType<typeof updateCourse>>>;
export type UpdateCourseMutationBody = BodyType<CourseUpdate>;
export type UpdateCourseMutationError = ErrorType<ErrorResponse>;
/**
* @summary Update a course
*/
export declare const useUpdateCourse: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateCourse>>, TError, {
        id: string;
        data: BodyType<CourseUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateCourse>>, TError, {
    id: string;
    data: BodyType<CourseUpdate>;
}, TContext>;
export declare const getDeleteCourseUrl: (id: string) => string;
/**
 * @summary Delete a course
 */
export declare const deleteCourse: (id: string, options?: Parameters<typeof customFetch>[1]) => Promise<void>;
export declare const getDeleteCourseMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteCourse>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteCourse>>, TError, {
    id: string;
}, TContext>;
export type DeleteCourseMutationResult = NonNullable<Awaited<ReturnType<typeof deleteCourse>>>;
export type DeleteCourseMutationError = ErrorType<ErrorResponse>;
/**
* @summary Delete a course
*/
export declare const useDeleteCourse: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteCourse>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteCourse>>, TError, {
    id: string;
}, TContext>;
export declare const getToggleCoursePublishedUrl: (id: string) => string;
/**
 * @summary Toggle published status of a course
 */
export declare const toggleCoursePublished: (id: string, publishToggle: PublishToggle, options?: Parameters<typeof customFetch>[1]) => Promise<Course>;
export declare const getToggleCoursePublishedMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof toggleCoursePublished>>, TError, {
        id: string;
        data: BodyType<PublishToggle>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof toggleCoursePublished>>, TError, {
    id: string;
    data: BodyType<PublishToggle>;
}, TContext>;
export type ToggleCoursePublishedMutationResult = NonNullable<Awaited<ReturnType<typeof toggleCoursePublished>>>;
export type ToggleCoursePublishedMutationBody = BodyType<PublishToggle>;
export type ToggleCoursePublishedMutationError = ErrorType<unknown>;
/**
* @summary Toggle published status of a course
*/
export declare const useToggleCoursePublished: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof toggleCoursePublished>>, TError, {
        id: string;
        data: BodyType<PublishToggle>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof toggleCoursePublished>>, TError, {
    id: string;
    data: BodyType<PublishToggle>;
}, TContext>;
export declare const getCreateUnitUrl: (id: string) => string;
/**
 * @summary Add a unit to a course
 */
export declare const createUnit: (id: string, unitInput: UnitInput, options?: Parameters<typeof customFetch>[1]) => Promise<Unit>;
export declare const getCreateUnitMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createUnit>>, TError, {
        id: string;
        data: BodyType<UnitInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createUnit>>, TError, {
    id: string;
    data: BodyType<UnitInput>;
}, TContext>;
export type CreateUnitMutationResult = NonNullable<Awaited<ReturnType<typeof createUnit>>>;
export type CreateUnitMutationBody = BodyType<UnitInput>;
export type CreateUnitMutationError = ErrorType<unknown>;
/**
* @summary Add a unit to a course
*/
export declare const useCreateUnit: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createUnit>>, TError, {
        id: string;
        data: BodyType<UnitInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createUnit>>, TError, {
    id: string;
    data: BodyType<UnitInput>;
}, TContext>;
export declare const getDeleteUnitUrl: (unitId: string) => string;
/**
 * @summary Delete a unit
 */
export declare const deleteUnit: (unitId: string, options?: Parameters<typeof customFetch>[1]) => Promise<void>;
export declare const getDeleteUnitMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteUnit>>, TError, {
        unitId: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteUnit>>, TError, {
    unitId: string;
}, TContext>;
export type DeleteUnitMutationResult = NonNullable<Awaited<ReturnType<typeof deleteUnit>>>;
export type DeleteUnitMutationError = ErrorType<unknown>;
/**
* @summary Delete a unit
*/
export declare const useDeleteUnit: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteUnit>>, TError, {
        unitId: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteUnit>>, TError, {
    unitId: string;
}, TContext>;
export declare const getCreateLessonUrl: (unitId: string) => string;
/**
 * @summary Add a lesson to a unit
 */
export declare const createLesson: (unitId: string, lessonInput: LessonInput, options?: Parameters<typeof customFetch>[1]) => Promise<Lesson>;
export declare const getCreateLessonMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createLesson>>, TError, {
        unitId: string;
        data: BodyType<LessonInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createLesson>>, TError, {
    unitId: string;
    data: BodyType<LessonInput>;
}, TContext>;
export type CreateLessonMutationResult = NonNullable<Awaited<ReturnType<typeof createLesson>>>;
export type CreateLessonMutationBody = BodyType<LessonInput>;
export type CreateLessonMutationError = ErrorType<unknown>;
/**
* @summary Add a lesson to a unit
*/
export declare const useCreateLesson: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createLesson>>, TError, {
        unitId: string;
        data: BodyType<LessonInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createLesson>>, TError, {
    unitId: string;
    data: BodyType<LessonInput>;
}, TContext>;
export declare const getGetLessonUrl: (lessonId: string) => string;
/**
 * @summary Get a lesson by ID
 */
export declare const getLesson: (lessonId: string, options?: Parameters<typeof customFetch>[1]) => Promise<LessonDetail>;
export declare const getGetLessonQueryKey: (lessonId: string) => readonly [`/api/lessons/${string}`];
export declare const getGetLessonQueryOptions: <TData = Awaited<ReturnType<typeof getLesson>>, TError = ErrorType<ErrorResponse>>(lessonId: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getLesson>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getLesson>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetLessonQueryResult = NonNullable<Awaited<ReturnType<typeof getLesson>>>;
export type GetLessonQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get a lesson by ID
 */
export declare function useGetLesson<TData = Awaited<ReturnType<typeof getLesson>>, TError = ErrorType<ErrorResponse>>(lessonId: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getLesson>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateLessonUrl: (lessonId: string) => string;
/**
 * @summary Update a lesson
 */
export declare const updateLesson: (lessonId: string, lessonUpdate: LessonUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<Lesson>;
export declare const getUpdateLessonMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateLesson>>, TError, {
        lessonId: string;
        data: BodyType<LessonUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateLesson>>, TError, {
    lessonId: string;
    data: BodyType<LessonUpdate>;
}, TContext>;
export type UpdateLessonMutationResult = NonNullable<Awaited<ReturnType<typeof updateLesson>>>;
export type UpdateLessonMutationBody = BodyType<LessonUpdate>;
export type UpdateLessonMutationError = ErrorType<unknown>;
/**
* @summary Update a lesson
*/
export declare const useUpdateLesson: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateLesson>>, TError, {
        lessonId: string;
        data: BodyType<LessonUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateLesson>>, TError, {
    lessonId: string;
    data: BodyType<LessonUpdate>;
}, TContext>;
export declare const getDeleteLessonUrl: (lessonId: string) => string;
/**
 * @summary Delete a lesson
 */
export declare const deleteLesson: (lessonId: string, options?: Parameters<typeof customFetch>[1]) => Promise<void>;
export declare const getDeleteLessonMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteLesson>>, TError, {
        lessonId: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteLesson>>, TError, {
    lessonId: string;
}, TContext>;
export type DeleteLessonMutationResult = NonNullable<Awaited<ReturnType<typeof deleteLesson>>>;
export type DeleteLessonMutationError = ErrorType<unknown>;
/**
* @summary Delete a lesson
*/
export declare const useDeleteLesson: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteLesson>>, TError, {
        lessonId: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteLesson>>, TError, {
    lessonId: string;
}, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map