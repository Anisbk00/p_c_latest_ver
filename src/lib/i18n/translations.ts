/**
 * Static UI translations — English, French
 *
 * Structure: { [locale]: { [key]: string } }
 * Keys use dot notation as a single string (no nested objects).
 * Missing keys always fall back to 'en'.
 *
 * @module lib/i18n/translations
 */

export type Locale = 'en' | 'fr';

export type TranslationKey =
  // ── Navigation ──────────────────────────────────────────────
  | 'nav.home'
  | 'nav.workouts'
  | 'nav.foods'
  | 'nav.profile'
  | 'nav.settings'
  | 'nav.coach'
  | 'nav.intelligence'
  // ── Common ──────────────────────────────────────────────────
  | 'common.save'
  | 'common.cancel'
  | 'common.loading'
  | 'common.error'
  | 'common.success'
  | 'common.back'
  | 'common.confirm'
  | 'common.delete'
  | 'common.edit'
  | 'common.add'
  | 'common.done'
  | 'common.search'
  | 'common.filter'
  | 'common.today'
  | 'common.yesterday'
  | 'common.week'
  | 'common.month'
  | 'common.year'
  | 'common.noData'
  | 'common.retry'
  // ── Settings ────────────────────────────────────────────────
  | 'settings.title'
  | 'settings.subtitle'
  | 'settings.tab.appearance'
  | 'settings.tab.account'
  | 'settings.tab.privacy'
  | 'settings.tab.notifications'
  | 'settings.language.title'
  | 'settings.language.description'
  | 'settings.language.en'
  | 'settings.language.fr'
  | 'settings.language.saved'
  | 'settings.units.title'
  | 'settings.units.metric'
  | 'settings.units.imperial'
  | 'settings.theme.title'
  | 'settings.notifications.title'
  | 'settings.notifications.push'
  | 'settings.notifications.email'
  | 'settings.account.title'
  | 'settings.account.signOut'
  | 'settings.account.deleteAccount'
  | 'settings.account.biometric'
  | 'settings.privacy.title'
  | 'settings.privacy.ironCoach'
  | 'settings.privacy.dataRetention'
  | 'settings.security.title'
  | 'settings.security.description'
  | 'settings.security.biometric'
  | 'settings.security.biometricDesc'
  | 'settings.security.biometricEnabled'
  | 'settings.security.biometricDisabled'
  | 'settings.security.biometricFailed'
  | 'settings.security.biometricNotSupported'
  | 'settings.security.twoFactor'
  | 'settings.security.twoFactorDesc'
  | 'settings.security.twoFactorComingSoon'
  | 'settings.security.enable'
  | 'settings.account.dangerZone'
  | 'settings.account.dangerDesc'
  | 'settings.account.deleteDialogTitle'
  | 'settings.account.deleteDialogDesc'
  | 'settings.account.deleteItem1'
  | 'settings.account.deleteItem2'
  | 'settings.account.deleteItem3'
  | 'settings.account.enterPassword'
  | 'settings.account.passwordPlaceholder'
  | 'settings.account.typeToConfirm'
  | 'settings.account.typeExactly'
  | 'settings.account.confirmDelete'
  | 'settings.account.deleteConfirmError'
  | 'settings.account.deleteSuccess'
  | 'settings.privacy.ironCoachData'
  | 'settings.privacy.ironCoachDesc'
  | 'settings.privacy.allowAnalysis'
  | 'settings.privacy.allowAnalysisDesc'
  | 'settings.dataManagement.title'
  | 'settings.dataManagement.export'
  | 'settings.dataManagement.exportDesc'
  | 'settings.dataManagement.requestExport'
  | 'settings.notifications.masterSwitch'
  | 'settings.notifications.masterSwitchDesc'
  | 'settings.notifications.sound'
  | 'settings.notifications.soundDesc'
  | 'settings.reminders.title'
  | 'settings.reminders.description'
  | 'settings.reminders.workout'
  | 'settings.reminders.workoutDesc'
  | 'settings.reminders.meal'
  | 'settings.reminders.mealDesc'
  | 'settings.reminders.hydration'
  | 'settings.reminders.hydrationDesc'
  | 'settings.reminders.streakProtection'
  | 'settings.reminders.streakProtectionDesc'
  | 'settings.insights.title'
  | 'settings.insights.description'
  | 'settings.insights.dailySummary'
  | 'settings.insights.dailySummaryDesc'
  | 'settings.insights.premium'
  | 'settings.insights.premiumDesc'
  | 'settings.notifications.pushEnabled'
  | 'settings.notifications.pushEnabledDesc'
  | 'settings.notifications.enabled'
  | 'settings.notifications.disabled'
  | 'settings.notifications.saved'
  | 'settings.notifications.emailDigest'
  | 'settings.notifications.emailDigestDesc'
  | 'settings.notifications.emailNone'
  | 'settings.notifications.emailDaily'
  | 'settings.notifications.emailWeekly'
  | 'settings.insights.achievements'
  | 'settings.insights.achievementsDesc'
  | 'settings.insights.coachInsights'
  | 'settings.insights.coachInsightsDesc'
  | 'settings.insights.motivational'
  | 'settings.insights.motivationalDesc'
  | 'settings.frequency.title'
  | 'settings.frequency.description'
  | 'settings.frequency.maxDaily'
  | 'settings.frequency.maxDailyDesc'
  | 'settings.frequency.quietHours'
  | 'settings.frequency.quietHoursDesc'
  | 'appearance.theme.title'
  | 'appearance.theme.description'
  | 'appearance.theme.keepThis'
  | 'appearance.theme.revert'
  | 'appearance.theme.session'
  | 'appearance.theme.save'
  | 'appearance.theme.theme'
  | 'appearance.theme.customThemes'
  | 'appearance.theme.saveTheme'
  | 'theme.light.name'
  | 'theme.light.description'
  | 'theme.dark.name'
  | 'theme.dark.description'
  | 'theme.gymbro.name'
  | 'theme.gymbro.description'
  | 'theme.gymgirl.name'
  | 'theme.gymgirl.description'
  // ── Dialogs ──────────────────────────────────────────────────
  | 'dialog.deleteAccount.title'
  | 'dialog.deleteAccount.description'
  | 'dialog.deleteAccount.confirm'
  | 'dialog.deleteAccount.cancel'
  | 'dialog.deleteAccount.deleting'
  // ── Toast Messages ───────────────────────────────────────────
  | 'toast.theme.saved'
  | 'toast.signOut.error'
  | 'toast.deleteAccount.success'
  | 'toast.deleteAccount.error'
  // ── Home / Dashboard ────────────────────────────────────────
  | 'home.greeting.morning'
  | 'home.greeting.afternoon'
  | 'home.greeting.evening'
  | 'home.calories.consumed'
  | 'home.calories.remaining'
  | 'home.calories.burned'
  | 'home.macros.protein'
  | 'home.macros.carbs'
  | 'home.macros.fat'
  | 'home.workouts.thisWeek'
  | 'home.workouts.noWorkouts'
  | 'home.streak.label'
  | 'home.streak.days'
  // ── Foods ───────────────────────────────────────────────────
  | 'foods.title'
  | 'foods.search.placeholder'
  | 'foods.add.title'
  | 'foods.log.breakfast'
  | 'foods.log.lunch'
  | 'foods.log.dinner'
  | 'foods.log.snack'
  | 'foods.barcode.scan'
  | 'foods.photo.analyze'
  | 'foods.noResults'
  | 'foods.calories'
  | 'foods.protein'
  | 'foods.carbs'
  | 'foods.fat'
  | 'foods.per100g'
  | 'foods.serving'
  | 'foods.supplements'
  | 'foods.hydration'
  | 'foods.dailyGoal'
  | 'foods.weeklyHistory'
  | 'foods.tapForHistory'
  | 'foods.viewingHistory'
  | 'foods.noHistory'
  | 'foods.now'
  | 'foods.selected'
  | 'foods.kcal'
  | 'foods.noLogs'
  | 'foods.caloriesLeft'
  | 'foods.overTarget'
  | 'foods.carbohydrates'
  | 'foods.addFood'
  | 'foods.quickAdd'
  | 'foods.noFoodsLogged'
  | 'foods.tapToAdd'
  | 'foods.undoLast'
  | 'foods.clearAll'
  | 'foods.glass'
  | 'foods.bottle'
  | 'foods.large'
  | 'foods.goal'
  | 'foods.insight.overTarget'
  | 'foods.insight.proteinOnTrack'
  | 'foods.insight.addProtein'
  | 'foods.insight.keepLogging'
  | 'foods.tomorrow'
  // ── Workouts ────────────────────────────────────────────────
  | 'workouts.title'
  | 'workouts.add'
  | 'workouts.start'
  | 'workouts.startWorkout'
  | 'workouts.chooseActivity'
  | 'workouts.greatWorkout'
  | 'workouts.activityCompleted'
  | 'workouts.movingTime'
  | 'workouts.elevationGain'
  | 'workouts.currentPace'
  | 'workouts.lastKm'
  | 'workouts.avgSpeed'
  | 'workouts.showLess'
  | 'workouts.moreMetrics'
  | 'workouts.resume'
  | 'workouts.pause'
  | 'workouts.share'
  | 'workouts.saving'
  | 'workouts.importGPX'
  | 'workouts.locationDenied'
  | 'workouts.gpsError'
  | 'workouts.online'
  | 'workouts.offline'
  | 'workouts.syncing'
  | 'workouts.history'
  | 'workouts.noWorkouts'
  | 'workouts.duration'
  | 'workouts.distance'
  | 'workouts.calories'
  | 'workouts.pace'
  | 'workouts.heartRate'
  | 'workouts.type.running'
  | 'workouts.type.cycling'
  | 'workouts.type.swimming'
  | 'workouts.type.strength'
  | 'workouts.type.walking'
  | 'workouts.type.yoga'
  | 'workouts.type.other'
  | 'workouts.type.hike'
  | 'workouts.type.ride'
  | 'workouts.recent'
  | 'workouts.complete'
  | 'workouts.paused'
  | 'workouts.laps'
  | 'workouts.lap'
  | 'workouts.save'
  | 'workouts.discard'
  | 'workouts.exportGPX'
  | 'workouts.notes'
  | 'workouts.notesPlaceholder'
  | 'workouts.howDidItFeel'
  | 'workouts.photos'
  | 'workouts.addPhoto'
  | 'workouts.noPhotos'
  | 'workouts.hrMonitor'
  | 'workouts.hrTapToPair'
  | 'workouts.hrConnecting'
  | 'workouts.hrDisconnect'
  | 'workouts.avgPace'
  | 'workouts.selectActivity'
  | 'workouts.selectActivityFirst'
  | 'workouts.startFirst'
  | 'workouts.min'
  | 'workouts.max'
  | 'workouts.avg'
  | 'workouts.bpm'
  | 'workouts.km'
  | 'workouts.pr'
  | 'workouts.hrZone.recovery'
  | 'workouts.hrZone.endurance'
  | 'workouts.hrZone.tempo'
  | 'workouts.hrZone.threshold'
  | 'workouts.hrZone.vo2max'
  | 'workouts.activity.run'
  | 'workouts.activity.cycle'
  | 'workouts.activity.walk'
  | 'workouts.activity.hike'
  | 'workouts.activity.swim'
  | 'workouts.activity.other'
  // ── Profile ─────────────────────────────────────────────────
  | 'profile.title'
  | 'profile.edit'
  | 'profile.goal'
  | 'profile.weight'
  | 'profile.height'
  | 'profile.age'
  | 'profile.sex'
  | 'profile.activityLevel'
  | 'profile.goal.fat_loss'
  | 'profile.goal.muscle_gain'
  | 'profile.goal.recomposition'
  | 'profile.goal.maintenance'
  | 'profile.goal.performance'
  | 'profile.activity.sedentary'
  | 'profile.activity.light'
  | 'profile.activity.moderate'
  | 'profile.activity.active'
  | 'profile.activity.very_active'
  // ── Iron Coach ──────────────────────────────────────────────
  | 'coach.title'
  | 'coach.placeholder'
  | 'coach.send'
  | 'coach.thinking'
  | 'coach.error'
  | 'coach.welcome'
  | 'coach.menu'
  | 'coach.clearChat'
  | 'coach.clearing'
  | 'coach.clearConfirm'
  | 'coach.freshStart'
  | 'coach.offlineAI'
  | 'coach.download'
  | 'coach.pause'
  | 'coach.resume'
  | 'coach.cancel'
  | 'coach.stopGenerating'
  | 'coach.fitnessFriend'
  | 'coach.remembersEverything'
  | 'coach.loadingHistory'
  | 'coach.welcomeNew'
  // ── Offline / Sync ──────────────────────────────────────────
  | 'offline.title'
  | 'offline.subtitle'
  | 'offline.syncing'
  | 'offline.uploading'
  | 'offline.pending'
  | 'offline.willSync'
  // ── Skip Link ────────────────────────────────────────────────
  | 'skipToContent'
  // ── Dashboard Cards ──────────────────────────────────────────
  | 'dashboard.bodyIntelligence'
  | 'dashboard.dailyActions'
  | 'dashboard.progressMirror'
  | 'dashboard.timeline'
  | 'dashboard.nutrition'
  | 'dashboard.hydration'
  | 'dashboard.steps'
  | 'dashboard.workout'
  | 'dashboard.viewHistory'
  // ── Analytics ───────────────────────────────────────────────
  | 'analytics.title'
  | 'analytics.weight.trend'
  | 'analytics.calories.trend'
  | 'analytics.workouts.trend'
  | 'analytics.noData'
  // ── Onboarding ──────────────────────────────────────────────
  | 'onboarding.welcome'
  | 'onboarding.goal.title'
  | 'onboarding.units.title'
  | 'onboarding.complete'
  // ── Home Page Insights ──────────────────────────────────────
  | 'home.insight.peakState'
  | 'home.insight.solidProgress'
  | 'home.insight.startSmall'
  | 'home.insight.ready'
  | 'home.insight.streak'
  | 'home.insight.incredibleStreak'
  | 'home.defaultGoalWarning'
  | 'home.trendingLeaner'
  | 'home.buildingStrength'
  | 'home.stableProgress'
  | 'home.comingSoon'
  | 'home.customTarget'
  | 'home.autoTarget'
  | 'home.startLogging'
  | 'home.excellentMomentum'
  | 'home.steadyProgress'
  | 'home.smallWins'
  | 'home.noWorkoutToday'
  | 'home.workoutCalories'
  | 'home.goalDefault'
  | 'home.goalUserDefined'
  | 'home.refreshError'
  | 'home.refreshErrorConnection'
  | 'home.refreshErrorPartial'
  | 'home.refreshErrorUnexpected'
  | 'home.over'
  | 'home.low'
  | 'home.kcalOverGoal'
  | 'home.kcalRemaining'
  | 'home.dailyGoal'
  | 'home.protein'
  | 'home.carbs'
  | 'home.fat'
  | 'home.todaysFuel'
  // ── Workouts Page ──────────────────────────────────────
  | 'workouts.chooseActivity'
  | 'workouts.readyToTrack'
  | 'workouts.start'
  | 'workouts.autoPauseGps'
  | 'workouts.bleHeartRate'
  | 'workouts.connected'
  | 'workouts.optional'
  | 'workouts.photoAttach'
  | 'workouts.duringWorkout'
  | 'workouts.routeFollowing'
  | 'workouts.liveMap'
  | 'workouts.offlineReady'
  | 'workouts.cachedMaps'
  | 'workouts.gpsError'
  | 'workouts.controlsLocked'
  | 'workouts.tapToLock'
  | 'workouts.connecting'
  | 'workouts.tapToPair'
  | 'workouts.run'
  | 'workouts.ride'
  | 'workouts.walk'
  | 'workouts.hike'
  | 'workouts.swim'
  | 'workouts.other'
  // ── Analytics/Intelligence Page ────────────────────────────────
  | 'analytics.title'
  | 'analytics.loading'
  | 'analytics.welcome'
  | 'analytics.startTracking'
  | 'analytics.weight'
  | 'analytics.bodyFat'
  | 'analytics.leanMass'
  | 'analytics.calories'
  | 'analytics.training'
  | 'analytics.recovery'
  | 'analytics.metric'
  | 'analytics.trackBodyWeight'
  | 'analytics.fatPercentage'
  | 'analytics.muscleMass'
  | 'analytics.dailyIntake'
  | 'analytics.workoutActivity'
  | 'analytics.calorieBalance'
  | 'analytics.logMoreData'
  | 'analytics.weightStable'
  | 'analytics.weightUp'
  | 'analytics.weightDown'
  | 'analytics.bodyFatDown'
  | 'analytics.bodyFatUp'
  | 'analytics.bodyFatStable'
  | 'analytics.buildingMuscle'
  | 'analytics.muscleDeclining'
  | 'analytics.muscleMaintained'
  | 'analytics.calorieIntake'
  | 'analytics.trainingActivity'
  | 'analytics.recoveryStatus'
  | 'analytics.performanceIntelligence'
  // ── Profile Page ───────────────────────────────────────────────
  | 'profile.editProfile'
  | 'profile.moreOptions'
  | 'profile.settings'
  | 'profile.signOut'
  | 'profile.resetEverything'
  | 'profile.deleteAccount'
  | 'profile.uploadAvatar'
  | 'profile.changeAvatar'
  | 'profile.yourName'
  | 'profile.currentWeight'
  | 'profile.targetWeight'
  | 'profile.height'
  | 'profile.age'
  | 'profile.gender'
  | 'profile.goal'
  | 'profile.activityLevel'
  | 'profile.dailyCalorieTarget'
  | 'profile.autoCalculation'
  | 'profile.excellent'
  | 'profile.goodProgress'
  | 'profile.keepTracking'
  | 'profile.consistency'
  | 'profile.progressPhotos'
  | 'profile.addPhoto'
  | 'profile.bodyComposition'
  | 'profile.streak'
  | 'profile.days'
  | 'profile.level'
  | 'profile.buildingHabits'
  | 'profile.xpProgress'
  | 'profile.myAccount'
  | 'profile.improving'
  | 'profile.stable'
  | 'profile.declining'
  | 'profile.weightTrendingDown'
  | 'profile.weightTrendingUp'
  | 'profile.keepLogging'
  | 'profile.trainingStats'
  | 'profile.workouts'
  | 'profile.daysTracked'
  | 'profile.consistencyScore'
  | 'profile.consistencyExcellent'
  | 'profile.consistencyGood'
  | 'profile.consistencyBuilding'
  | 'profile.consistencyStart'
  | 'profile.identitySnapshot'
  | 'profile.export'
  | 'profile.totalXP'
  | 'profile.nutritionScore'
  | 'profile.photos'
  | 'profile.meals'
  | 'profile.excellentTracking'
  | 'profile.goodProgressHabit'
  | 'profile.buildingHabitsDaily'
  | 'profile.startTracking';

// ════════════════════════════════════════════════════════════════
// English
// ════════════════════════════════════════════════════════════════
const en: Record<TranslationKey, string> = {
  'nav.home': 'Home',
  'nav.workouts': 'Workouts',
  'nav.foods': 'Foods',
  'nav.profile': 'Profile',
  'nav.settings': 'Settings',
  'nav.coach': 'Iron Coach',
  'nav.intelligence': 'Intelligence',

  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.loading': 'Loading…',
  'common.error': 'Something went wrong',
  'common.success': 'Success',
  'common.back': 'Back',
  'common.confirm': 'Confirm',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.done': 'Done',
  'common.search': 'Search',
  'common.filter': 'Filter',
  'common.today': 'Today',
  'common.yesterday': 'Yesterday',
  'common.week': 'This Week',
  'common.month': 'This Month',
  'common.year': 'This Year',
  'common.noData': 'No data yet',
  'common.retry': 'Retry',

  'settings.title': 'Settings',
  'settings.subtitle': 'Manage your preferences and account.',
  'settings.tab.appearance': 'Appearance',
  'settings.tab.account': 'Account',
  'settings.tab.privacy': 'Privacy',
  'settings.tab.notifications': 'Notifications',
  'settings.language.title': 'Language',
  'settings.language.description': 'Choose your preferred language. The interface updates immediately.',
  'settings.language.en': 'English',
  'settings.language.fr': 'Français',
  'settings.language.saved': 'Language updated',
  'settings.units.title': 'Units',
  'settings.units.metric': 'Metric (kg, km)',
  'settings.units.imperial': 'Imperial (lbs, miles)',
  'settings.theme.title': 'Theme',
  'settings.notifications.title': 'Notifications',
  'settings.notifications.push': 'Push Notifications',
  'settings.notifications.email': 'Email Digest',
  'settings.account.title': 'Account',
  'settings.account.signOut': 'Sign Out',
  'settings.account.deleteAccount': 'Delete Account',
  'settings.account.biometric': 'Biometric Authentication',
  'settings.privacy.title': 'Privacy',
  'settings.privacy.ironCoach': 'Iron Coach Data Access',
  'settings.privacy.dataRetention': 'Data Retention',
  'settings.security.title': 'Security',
  'settings.security.description': 'Manage how you sign in and secure your account.',
  'settings.security.biometric': 'Biometric Authentication',
  'settings.security.biometricDesc': 'Use Face ID or Touch ID to unlock.',
  'settings.security.biometricEnabled': 'Biometric authentication enabled',
  'settings.security.biometricDisabled': 'Biometric authentication disabled',
  'settings.security.biometricFailed': 'Failed to enable biometric authentication',
  'settings.security.biometricNotSupported': 'Biometric authentication is not available on this device.',
  'settings.security.twoFactor': 'Two-Factor Authentication',
  'settings.security.twoFactorDesc': 'Add an extra layer of security.',
  'settings.security.twoFactorComingSoon': 'Two-factor authentication coming soon!',
  'settings.security.enable': 'Enable',
  'settings.account.dangerZone': 'Account',
  'settings.account.dangerDesc': 'Sign out or delete your account.',
  'settings.account.deleteDialogTitle': 'Delete Account Permanently?',
  'settings.account.deleteDialogDesc': 'This action cannot be undone. This will permanently delete:',
  'settings.account.deleteItem1': 'All your workout and nutrition data',
  'settings.account.deleteItem2': 'All your progress photos and body metrics',
  'settings.account.deleteItem3': 'Your account and all settings',
  'settings.account.enterPassword': 'Enter your password',
  'settings.account.passwordPlaceholder': 'Your current password',
  'settings.account.typeToConfirm': 'Type to confirm',
  'settings.account.typeExactly': 'Type exactly: DELETE MY ACCOUNT',
  'settings.account.confirmDelete': 'Delete Forever',
  'settings.account.deleteConfirmError': 'Please type "DELETE MY ACCOUNT" exactly to confirm',
  'settings.account.deleteSuccess': 'Account deleted successfully',
  'settings.privacy.ironCoachData': 'Iron Coach Data',
  'settings.privacy.ironCoachDesc': 'Control how your data informs AI insights.',
  'settings.privacy.allowAnalysis': 'Allow Personal Data Analysis',
  'settings.privacy.allowAnalysisDesc': 'Let Iron Coach reference your logs for better advice.',
  'settings.dataManagement.title': 'Data Management',
  'settings.dataManagement.export': 'Export Your Data',
  'settings.dataManagement.exportDesc': 'Download a copy of all your activity.',
  'settings.dataManagement.requestExport': 'Request Export',
  'settings.notifications.masterSwitch': 'Enable Notifications',
  'settings.notifications.masterSwitchDesc': 'Master switch for all notifications.',
  'settings.notifications.sound': 'Sound',
  'settings.notifications.soundDesc': 'Play sound for notifications.',
  'settings.reminders.title': 'Reminders',
  'settings.reminders.description': 'Stay on track with smart reminders.',
  'settings.reminders.workout': 'Workout Reminders',
  'settings.reminders.workoutDesc': 'Get reminded to work out based on your schedule.',
  'settings.reminders.meal': 'Meal Reminders',
  'settings.reminders.mealDesc': 'Reminders to log your meals throughout the day.',
  'settings.reminders.hydration': 'Hydration Reminders',
  'settings.reminders.hydrationDesc': 'Stay hydrated with regular water reminders.',
  'settings.reminders.streakProtection': 'Streak Protection',
  'settings.reminders.streakProtectionDesc': 'Get warned when your streak is at risk.',
  'settings.insights.title': 'Insights & Achievements',
  'settings.insights.description': 'Celebrate progress and get personalized insights.',
  'settings.insights.dailySummary': 'Daily Summary',
  'settings.insights.dailySummaryDesc': 'Morning briefing of your goals and progress.',
  'settings.insights.premium': 'Premium Insights',
  'settings.insights.premiumDesc': 'Get notified about advanced analytics and tips.',
  'settings.notifications.pushEnabled': 'Push Notifications',
  'settings.notifications.pushEnabledDesc': 'Enable all push notifications',
  'settings.notifications.enabled': 'Notifications enabled',
  'settings.notifications.disabled': 'Notifications disabled',
  'settings.notifications.saved': 'Settings saved',
  'settings.notifications.emailDigest': 'Email Digest',
  'settings.notifications.emailDigestDesc': 'Receive periodic email summaries',
  'settings.notifications.emailNone': 'None',
  'settings.notifications.emailDaily': 'Daily',
  'settings.notifications.emailWeekly': 'Weekly',
  'settings.insights.achievements': 'Achievements',
  'settings.insights.achievementsDesc': 'Celebrate new personal records and milestones.',
  'settings.insights.coachInsights': 'Iron Coach Insights',
  'settings.insights.coachInsightsDesc': 'Personalized tips and motivation from your coach.',
  'settings.insights.motivational': 'Motivational Messages',
  'settings.insights.motivationalDesc': 'Occasional motivational messages to keep you going.',
  'settings.frequency.title': 'Frequency',
  'settings.frequency.description': 'Control how often you receive notifications.',
  'settings.frequency.maxDaily': 'Max Daily Notifications',
  'settings.frequency.maxDailyDesc': 'Maximum notifications per day (3-10).',
  'settings.frequency.quietHours': 'Quiet Hours',
  'settings.frequency.quietHoursDesc': 'No notifications during these hours.',
  'appearance.theme.title': 'Theme',
  'appearance.theme.description': 'Select your preferred visual style.',
  'appearance.theme.keepThis': 'Keep this theme?',
  'appearance.theme.revert': 'Revert',
  'appearance.theme.session': 'Session',
  'appearance.theme.save': 'Save',
  'appearance.theme.theme': 'Theme',
  'appearance.theme.customThemes': 'Custom Themes',
  'appearance.theme.saveTheme': 'Save Theme',

  'theme.light.name': 'Light',
  'theme.light.description': 'Pure clarity. Clean surfaces and calm focus.',
  'theme.dark.name': 'Dark',
  'theme.dark.description': 'Easy on the eyes. Deep, restful tones.',
  'theme.gymbro.name': 'Gymbro',
  'theme.gymbro.description': 'BEAST MODE. Alpha energy. Pure testosterone.',
  'theme.gymgirl.name': 'Gymsis',
  'theme.gymgirl.description': 'Soft strength. Cute, pink, and empowering.',

  'dialog.deleteAccount.title': 'Delete Account?',
  'dialog.deleteAccount.description': 'This will permanently delete your account and ALL associated data including your profile, meals, workouts, progress photos, and goals. This action cannot be undone.',
  'dialog.deleteAccount.confirm': 'Delete My Account',
  'dialog.deleteAccount.cancel': 'Cancel',
  'dialog.deleteAccount.deleting': 'Deleting...',

  'toast.theme.saved': 'Theme saved',
  'toast.signOut.error': 'Failed to sign out',
  'toast.deleteAccount.success': 'Account deleted successfully',
  'toast.deleteAccount.error': 'Failed to delete account',

  'home.greeting.morning': 'Good morning',
  'home.greeting.afternoon': 'Good afternoon',
  'home.greeting.evening': 'Good evening',
  'home.calories.consumed': 'Consumed',
  'home.calories.remaining': 'Remaining',
  'home.calories.burned': 'Burned',
  'home.macros.protein': 'Protein',
  'home.macros.carbs': 'Carbs',
  'home.macros.fat': 'Fat',
  'home.workouts.thisWeek': 'Workouts this week',
  'home.workouts.noWorkouts': 'No workouts yet',
  'home.streak.label': 'Streak',
  'home.streak.days': 'days',

  'foods.title': 'Foods',
  'foods.search.placeholder': 'Search foods…',
  'foods.add.title': 'Add Food',
  'foods.log.breakfast': 'Breakfast',
  'foods.log.lunch': 'Lunch',
  'foods.log.dinner': 'Dinner',
  'foods.log.snack': 'Snack',
  'foods.barcode.scan': 'Scan Barcode',
  'foods.photo.analyze': 'Analyze Photo',
  'foods.noResults': 'No foods found',
  'foods.calories': 'Calories',
  'foods.protein': 'Protein',
  'foods.carbs': 'Carbs',
  'foods.fat': 'Fat',
  'foods.per100g': 'per 100g',
  'foods.serving': 'Serving',
  'foods.supplements': 'Supplements',
  'foods.hydration': 'Hydration',
  'foods.dailyGoal': 'Daily Goal',
  'foods.weeklyHistory': 'Weekly History',
  'foods.tapForHistory': 'Tap for history',
  'foods.viewingHistory': 'Viewing history - New entries will be logged for this day',
  'foods.noHistory': 'No history data available',
  'foods.now': 'NOW',
  'foods.selected': 'SELECTED',
  'foods.kcal': 'kcal',
  'foods.noLogs': 'no logs',
  'foods.caloriesLeft': 'calories left',
  'foods.overTarget': 'over target',
  'foods.carbohydrates': 'Carbohydrates',
  'foods.addFood': 'Add Food',
  'foods.quickAdd': 'Quick Add',
  'foods.noFoodsLogged': 'No foods logged yet',
  'foods.tapToAdd': 'Tap to add',
  'foods.undoLast': 'Undo Last',
  'foods.clearAll': 'Clear All',
  'foods.glass': 'Glass',
  'foods.bottle': 'Bottle',
  'foods.large': 'Large',
  'foods.goal': 'Goal',
  'foods.insight.overTarget': 'Over target by',
  'foods.insight.proteinOnTrack': 'Protein target on track. Great job!',
  'foods.insight.addProtein': 'Add protein to hit your target.',
  'foods.insight.keepLogging': 'Keep logging to see your progress.',
  'foods.tomorrow': 'Tomorrow',

  'workouts.title': 'Workouts',
  'workouts.add': 'Add Workout',
  'workouts.start': 'Start',
  'workouts.startWorkout': 'Start Workout',
  'workouts.chooseActivity': 'Choose Activity',
  'workouts.greatWorkout': 'Great workout!',
  'workouts.activityCompleted': 'completed',
  'workouts.movingTime': 'Moving time',
  'workouts.elevationGain': 'Elevation gain',
  'workouts.currentPace': 'Current Pace',
  'workouts.lastKm': 'Last km',
  'workouts.avgSpeed': 'Avg speed',
  'workouts.showLess': 'Show less',
  'workouts.moreMetrics': 'More metrics',
  'workouts.resume': 'Resume',
  'workouts.pause': 'Pause',
  'workouts.share': 'Share',
  'workouts.saving': 'Saving...',
  'workouts.importGPX': 'Import GPX Route',
  'workouts.locationDenied': 'Location permission denied. Please enable location access in your browser settings to track workouts.',
  'workouts.gpsError': 'GPS Error',
  'workouts.online': 'Online',
  'workouts.offline': 'Offline',
  'workouts.syncing': 'Syncing',
  'workouts.history': 'History',
  'workouts.noWorkouts': 'No workouts logged',
  'workouts.duration': 'Duration',
  'workouts.distance': 'Distance',
  'workouts.calories': 'Calories',
  'workouts.pace': 'Pace',
  'workouts.heartRate': 'Heart Rate',
  'workouts.type.running': 'Running',
  'workouts.type.cycling': 'Cycling',
  'workouts.type.swimming': 'Swimming',
  'workouts.type.strength': 'Strength',
  'workouts.type.walking': 'Walking',
  'workouts.type.yoga': 'Yoga',
  'workouts.type.other': 'Other',
  'workouts.type.hike': 'Hike',
  'workouts.type.ride': 'Ride',
  'workouts.recent': 'Recent Workouts',
  'workouts.complete': 'Workout Complete!',
  'workouts.paused': 'Paused',
  'workouts.laps': 'Laps',
  'workouts.lap': 'Lap',
  'workouts.save': 'Save Workout',
  'workouts.discard': 'Discard',
  'workouts.exportGPX': 'Export GPX',
  'workouts.notes': 'Notes',
  'workouts.notesPlaceholder': 'How was your workout?',
  'workouts.howDidItFeel': 'How did it feel?',
  'workouts.photos': 'Photos',
  'workouts.addPhoto': 'Add Photo',
  'workouts.noPhotos': 'No photos yet',
  'workouts.hrMonitor': 'Heart Rate Monitor',
  'workouts.hrTapToPair': 'Tap to pair via Bluetooth',
  'workouts.hrConnecting': 'Connecting...',
  'workouts.hrDisconnect': 'Disconnect',
  'workouts.avgPace': 'Avg Pace',
  'workouts.selectActivity': 'Select Activity',
  'workouts.selectActivityFirst': 'Select an activity first',
  'workouts.startFirst': 'Start your first workout!',
  'workouts.min': 'MIN',
  'workouts.max': 'MAX',
  'workouts.avg': 'AVG',
  'workouts.bpm': 'BPM',
  'workouts.km': 'km',
  'workouts.pr': 'PR',
  'workouts.hrZone.recovery': 'Recovery',
  'workouts.hrZone.endurance': 'Endurance',
  'workouts.hrZone.tempo': 'Tempo',
  'workouts.hrZone.threshold': 'Threshold',
  'workouts.hrZone.vo2max': 'VO2 Max',
  'workouts.activity.run': 'Run',
  'workouts.activity.cycle': 'Cycle',
  'workouts.activity.walk': 'Walk',
  'workouts.activity.hike': 'Hike',
  'workouts.activity.swim': 'Swim',
  'workouts.activity.other': 'Other',

  'profile.title': 'Profile',
  'profile.edit': 'Edit Profile',
  'profile.goal': 'Goal',
  'profile.weight': 'Weight',
  'profile.height': 'Height',
  'profile.age': 'Age',
  'profile.sex': 'Sex',
  'profile.activityLevel': 'Activity Level',
  'profile.goal.fat_loss': 'Fat Loss',
  'profile.goal.muscle_gain': 'Muscle Gain',
  'profile.goal.recomposition': 'Recomposition',
  'profile.goal.maintenance': 'Maintenance',
  'profile.goal.performance': 'Performance',
  'profile.activity.sedentary': 'Sedentary',
  'profile.activity.light': 'Light Activity',
  'profile.activity.moderate': 'Moderate',
  'profile.activity.active': 'Active',
  'profile.activity.very_active': 'Very Active',

  'coach.title': 'Iron Coach',
  'coach.placeholder': 'Ask Iron Coach...',
  'coach.send': 'Send',
  'coach.thinking': 'The Iron Coach is thinking…',
  'coach.error': 'Failed to get a response. Try again.',
  'coach.welcome': "I'm The Iron Coach. No excuses. What do you need?",
  'coach.menu': 'Menu',
  'coach.clearChat': 'Clear chat history',
  'coach.clearing': 'Clearing...',
  'coach.clearConfirm': 'Clear all chat history? This cannot be undone.',
  'coach.freshStart': "Fresh start! 🔄 I'm ready to help you on your fitness journey. What would you like to work on? 💪",
  'coach.offlineAI': 'Offline AI Available',
  'coach.download': 'Download',
  'coach.pause': 'Pause',
  'coach.resume': 'Resume',
  'coach.cancel': 'Cancel',
  'coach.stopGenerating': 'Stop generating',
  'coach.fitnessFriend': 'Your fitness friend',
  'coach.remembersEverything': 'I remember everything',
  'coach.loadingHistory': 'Loading your history...',
  'coach.welcomeNew': "Hey! 👋 I'm **Iron Coach** — your personal fitness friend and coach. I'm here to help you crush your goals, stay accountable, and actually enjoy the journey. I remember everything about you, so every time we chat, we pick up right where we left off. How can I help you today? 💪",

  'offline.title': "You're offline",
  'offline.subtitle': 'Data will sync when connection is restored',
  'offline.syncing': 'Syncing',
  'offline.uploading': 'Uploading offline data...',
  'offline.pending': 'pending',
  'offline.willSync': 'Data will sync when connection is restored',

  'skipToContent': 'Skip to main content',

  'dashboard.bodyIntelligence': 'Body Intelligence',
  'dashboard.dailyActions': 'Daily Actions',
  'dashboard.progressMirror': 'Progress Mirror',
  'dashboard.timeline': "Today's Timeline",
  'dashboard.nutrition': 'Nutrition',
  'dashboard.hydration': 'Hydration',
  'dashboard.steps': 'Steps',
  'dashboard.workout': 'Workout',
  'dashboard.viewHistory': 'View History',

  'analytics.title': 'Analytics',
  'analytics.weight.trend': 'Weight Trend',
  'analytics.calories.trend': 'Calorie Trend',
  'analytics.workouts.trend': 'Workout Trend',
  'analytics.noData': 'Not enough data to show trends',

  'onboarding.welcome': 'Welcome to Progress Companion',
  'onboarding.goal.title': 'What is your primary goal?',
  'onboarding.units.title': 'Choose your units',
  'onboarding.complete': 'Get Started',

  // Home page insights
  'home.insight.peakState': 'Your body is in a peak state today',
  'home.insight.solidProgress': 'Solid progress — keep the rhythm',
  'home.insight.startSmall': 'Every action counts. Start small.',
  'home.insight.ready': 'Ready when you are.',
  'home.insight.streak': '-day streak — keep it going!',
  'home.insight.incredibleStreak': 'Incredible -day streak!',
  'home.defaultGoalWarning': '⚠️ Using default goal. Set your goal in Profile for accurate scores.',
  'home.trendingLeaner': 'Trending leaner',
  'home.buildingStrength': 'Building strength',
  'home.stableProgress': 'Stable progress',
  'home.comingSoon': 'Coming Soon',
  'home.customTarget': 'Custom target',
  'home.autoTarget': 'Auto target',
  'home.startLogging': 'Start logging your meals',
  'home.excellentMomentum': 'Excellent momentum. Your body is responding well to your current routine.',
  'home.steadyProgress': 'Steady progress. Focus on protein timing for better recovery.',
  'home.smallWins': 'Start with small wins. Even a short walk moves you forward.',
  'home.noWorkoutToday': 'No workout today',
  'home.workoutCalories': 'Workout: {calories} cal burned',
  'home.goalDefault': 'Goal: using default (maintenance)',
  'home.goalUserDefined': 'Goal: user-defined',
  'home.refreshError': 'Some data failed to refresh.',
  'home.refreshErrorConnection': 'Failed to refresh data. Please check your connection.',
  'home.refreshErrorPartial': 'Some data failed to refresh.',
  'home.refreshErrorUnexpected': 'An unexpected error occurred. Please try again.',
  'home.over': 'OVER',
  'home.low': 'LOW',
  'home.kcalOverGoal': '{value} kcal over goal',
  'home.kcalRemaining': '{value} kcal remaining',
  'home.dailyGoal': 'of {value} kcal daily goal',
  'home.protein': 'Protein',
  'home.carbs': 'Carbs',
  'home.fat': 'Fat',
  'home.todaysFuel': "Today's Fuel",
  // Workouts Page
  'workouts.chooseActivity': 'Choose Activity',
  'workouts.readyToTrack': 'Ready to track your workout?',
  'workouts.start': 'Start',
  'workouts.autoPauseGps': 'Auto-pause enabled • GPS tracking active',
  'workouts.bleHeartRate': 'BLE Heart Rate',
  'workouts.connected': 'Connected',
  'workouts.optional': 'Optional',
  'workouts.photoAttach': 'Photo Attach',
  'workouts.duringWorkout': 'During workout',
  'workouts.routeFollowing': 'Route Following',
  'workouts.liveMap': 'Live map',
  'workouts.offlineReady': 'Offline Ready',
  'workouts.cachedMaps': 'Cached maps',
  'workouts.gpsError': 'GPS Error',
  'workouts.controlsLocked': 'Controls locked',
  'workouts.tapToLock': 'Tap to lock',
  'workouts.connecting': 'Connecting...',
  'workouts.tapToPair': 'Tap to pair via Bluetooth',
  'workouts.run': 'Run',
  'workouts.ride': 'Ride',
  'workouts.walk': 'Walk',
  'workouts.hike': 'Hike',
  'workouts.swim': 'Swim',
  'workouts.other': 'Other',
  // Analytics/Intelligence Page
  'analytics.title': 'Intelligence',
  'analytics.loading': 'Loading your data...',
  'analytics.welcome': 'Welcome to Your Intelligence Hub',
  'analytics.startTracking': 'Start tracking your progress to see personalized insights here.',
  'analytics.weight': 'Weight',
  'analytics.bodyFat': 'Body Fat',
  'analytics.leanMass': 'Lean Mass',
  'analytics.calories': 'Calories',
  'analytics.training': 'Training',
  'analytics.recovery': 'Recovery',
  'analytics.metric': 'Metric',
  'analytics.trackBodyWeight': 'Track body weight',
  'analytics.fatPercentage': 'Fat percentage',
  'analytics.muscleMass': 'Muscle mass',
  'analytics.dailyIntake': 'Daily intake',
  'analytics.workoutActivity': 'Workout activity',
  'analytics.calorieBalance': 'Calorie Balance',
  'analytics.logMoreData': 'Log more data',
  'analytics.weightStable': 'Weight is Stable',
  'analytics.weightUp': 'Weight Trending Upward',
  'analytics.weightDown': 'Weight Trending Downward',
  'analytics.bodyFatDown': 'Body Fat Decreasing',
  'analytics.bodyFatUp': 'Body Fat Increasing',
  'analytics.bodyFatStable': 'Body Fat Stable',
  'analytics.buildingMuscle': 'Building Muscle',
  'analytics.muscleDeclining': 'Muscle Mass Declining',
  'analytics.muscleMaintained': 'Muscle Maintained',
  'analytics.calorieIntake': 'Your Calorie Intake',
  'analytics.trainingActivity': 'Your Training Activity',
  'analytics.recoveryStatus': 'Your Recovery Status',
  'analytics.performanceIntelligence': 'Performance Intelligence',
  // Profile Page
  'profile.editProfile': 'Edit Profile',
  'profile.moreOptions': 'More Options',
  'profile.settings': 'Settings',
  'profile.signOut': 'Sign Out',
  'profile.resetEverything': 'Reset Everything',
  'profile.deleteAccount': 'Delete Account',
  'profile.uploadAvatar': 'Upload avatar',
  'profile.changeAvatar': 'Change avatar',
  'profile.yourName': 'Your name',
  'profile.currentWeight': 'Current Weight',
  'profile.targetWeight': 'Target Weight',
  'profile.height': 'Height',
  'profile.age': 'Age',
  'profile.gender': 'Gender',
  'profile.goal': 'Goal',
  'profile.activityLevel': 'Activity Level',
  'profile.dailyCalorieTarget': 'Daily Calorie Target',
  'profile.autoCalculation': 'Leave empty for smart auto-calculation',
  'profile.excellent': 'Excellent!',
  'profile.goodProgress': 'Good progress',
  'profile.keepTracking': 'Keep tracking!',
  'profile.consistency': 'Consistency',
  'profile.progressPhotos': 'Progress Photos',
  'profile.addPhoto': 'Add Photo',
  'profile.bodyComposition': 'Body Composition',
  'profile.streak': 'Streak',
  'profile.days': 'days',
  'profile.level': 'Level',
  'profile.buildingHabits': 'Building better habits, one day at a time',
  'profile.xpProgress': 'XP Progress',
  'profile.myAccount': 'My Account',
  'profile.improving': 'improving',
  'profile.stable': 'stable',
  'profile.declining': 'declining',
  'profile.weightTrendingDown': 'Weight trending downward',
  'profile.weightTrendingUp': 'Weight trending upward',
  'profile.keepLogging': 'Keep logging your meals and workouts to see your evolution insights.',
  'profile.trainingStats': 'Training Stats',
  'profile.workouts': 'Workouts',
  'profile.daysTracked': 'Days Tracked',
  'profile.consistencyScore': 'Consistency Score',
  'profile.consistencyExcellent': 'Excellent! Tracking almost every day.',
  'profile.consistencyGood': 'Good progress! Keep building the habit.',
  'profile.consistencyBuilding': 'Building habits. Try to track daily.',
  'profile.consistencyStart': 'Start tracking meals, workouts, or weight to build consistency.',
  'profile.identitySnapshot': 'Identity Snapshot',
  'profile.export': 'Export',
  'profile.totalXP': 'Total XP',
  'profile.nutritionScore': 'Nutrition Score',
  'profile.photos': 'Photos',
  'profile.meals': 'Meals',
  'profile.excellentTracking': 'Excellent! Tracking almost every day.',
  'profile.goodProgressHabit': 'Good progress! Keep building the habit.',
  'profile.buildingHabitsDaily': 'Building habits. Try to track daily.',
  'profile.startTracking': 'Start tracking meals, workouts, or weight to build consistency.',
};

// ════════════════════════════════════════════════════════════════
// French
// ════════════════════════════════════════════════════════════════
const fr: Record<TranslationKey, string> = {
  'nav.home': 'Accueil',
  'nav.workouts': 'Entraînements',
  'nav.foods': 'Aliments',
  'nav.profile': 'Profil',
  'nav.settings': 'Paramètres',
  'nav.coach': 'Iron Coach',
  'nav.intelligence': 'Intelligence',

  'common.save': 'Enregistrer',
  'common.cancel': 'Annuler',
  'common.loading': 'Chargement…',
  'common.error': 'Une erreur est survenue',
  'common.success': 'Succès',
  'common.back': 'Retour',
  'common.confirm': 'Confirmer',
  'common.delete': 'Supprimer',
  'common.edit': 'Modifier',
  'common.add': 'Ajouter',
  'common.done': 'Terminé',
  'common.search': 'Rechercher',
  'common.filter': 'Filtrer',
  'common.today': "Aujourd'hui",
  'common.yesterday': 'Hier',
  'common.week': 'Cette semaine',
  'common.month': 'Ce mois',
  'common.year': 'Cette année',
  'common.noData': 'Aucune donnée',
  'common.retry': 'Réessayer',

  'settings.title': 'Paramètres',
  'settings.subtitle': 'Gérez vos préférences et votre compte.',
  'settings.tab.appearance': 'Apparence',
  'settings.tab.account': 'Compte',
  'settings.tab.privacy': 'Confidentialité',
  'settings.tab.notifications': 'Notifications',
  'settings.language.title': 'Langue',
  'settings.language.description': "Choisissez votre langue préférée. L'interface se met à jour immédiatement.",
  'settings.language.en': 'English',
  'settings.language.fr': 'Français',
  'settings.language.saved': 'Langue mise à jour',
  'settings.units.title': 'Unités',
  'settings.units.metric': 'Métrique (kg, km)',
  'settings.units.imperial': 'Impérial (lbs, miles)',
  'settings.theme.title': 'Thème',
  'settings.notifications.title': 'Notifications',
  'settings.notifications.push': 'Notifications push',
  'settings.notifications.email': 'Digest e-mail',
  'settings.account.title': 'Compte',
  'settings.account.signOut': 'Se déconnecter',
  'settings.account.deleteAccount': 'Supprimer le compte',
  'settings.account.biometric': 'Authentification biométrique',
  'settings.privacy.title': 'Confidentialité',
  'settings.privacy.ironCoach': 'Accès aux données Iron Coach',
  'settings.privacy.dataRetention': 'Conservation des données',
  'settings.security.title': 'Sécurité',
  'settings.security.description': 'Gérez comment vous vous connectez et sécurisez votre compte.',
  'settings.security.biometric': 'Authentification biométrique',
  'settings.security.biometricDesc': 'Utilisez Face ID ou Touch ID pour déverrouiller.',
  'settings.security.biometricEnabled': 'Authentification biométrique activée',
  'settings.security.biometricDisabled': 'Authentification biométrique désactivée',
  'settings.security.biometricFailed': 'Échec de l\'activation de l\'authentification biométrique',
  'settings.security.biometricNotSupported': 'L\'authentification biométrique n\'est pas disponible sur cet appareil.',
  'settings.security.twoFactor': 'Authentification à deux facteurs',
  'settings.security.twoFactorDesc': 'Ajoutez une couche de sécurité supplémentaire.',
  'settings.security.twoFactorComingSoon': 'L\'authentification à deux facteurs arrive bientôt !',
  'settings.security.enable': 'Activer',
  'settings.account.dangerZone': 'Compte',
  'settings.account.dangerDesc': 'Déconnectez-vous ou supprimez votre compte.',
  'settings.account.deleteDialogTitle': 'Supprimer le compte définitivement ?',
  'settings.account.deleteDialogDesc': 'Cette action est irréversible. Cela supprimera définitivement :',
  'settings.account.deleteItem1': 'Toutes vos données d\'entraînement et de nutrition',
  'settings.account.deleteItem2': 'Toutes vos photos de progression et métriques corporelles',
  'settings.account.deleteItem3': 'Votre compte et tous les paramètres',
  'settings.account.enterPassword': 'Entrez votre mot de passe',
  'settings.account.passwordPlaceholder': 'Votre mot de passe actuel',
  'settings.account.typeToConfirm': 'Tapez pour confirmer',
  'settings.account.typeExactly': 'Tapez exactement : DELETE MY ACCOUNT',
  'settings.account.confirmDelete': 'Supprimer définitivement',
  'settings.account.deleteConfirmError': 'Veuillez taper exactement "DELETE MY ACCOUNT" pour confirmer',
  'settings.account.deleteSuccess': 'Compte supprimé avec succès',
  'settings.privacy.ironCoachData': 'Données Iron Coach',
  'settings.privacy.ironCoachDesc': 'Contrôlez comment vos données informent les insights IA.',
  'settings.privacy.allowAnalysis': 'Autoriser l\'analyse des données personnelles',
  'settings.privacy.allowAnalysisDesc': 'Laissez Iron Coach utiliser vos journaux pour de meilleurs conseils.',
  'settings.dataManagement.title': 'Gestion des données',
  'settings.dataManagement.export': 'Exporter vos données',
  'settings.dataManagement.exportDesc': 'Téléchargez une copie de toute votre activité.',
  'settings.dataManagement.requestExport': 'Demander l\'export',
  'settings.notifications.masterSwitch': 'Activer les notifications',
  'settings.notifications.masterSwitchDesc': 'Interrupteur principal pour toutes les notifications.',
  'settings.notifications.sound': 'Son',
  'settings.notifications.soundDesc': 'Jouer un son pour les notifications.',
  'settings.reminders.title': 'Rappels',
  'settings.reminders.description': 'Restez sur la bonne voie avec des rappels intelligents.',
  'settings.reminders.workout': 'Rappels d\'entraînement',
  'settings.reminders.workoutDesc': 'Soyez rappelé de vous entraîner selon votre emploi du temps.',
  'settings.reminders.meal': 'Rappels de repas',
  'settings.reminders.mealDesc': 'Rappels pour enregistrer vos repas tout au long de la journée.',
  'settings.reminders.hydration': 'Rappels d\'hydratation',
  'settings.reminders.hydrationDesc': 'Restez hydraté avec des rappels d\'eau réguliers.',
  'settings.reminders.streakProtection': 'Protection de série',
  'settings.reminders.streakProtectionDesc': 'Soyez averti quand votre série est en danger.',
  'settings.insights.title': 'Insights & Réalisations',
  'settings.insights.description': 'Célébrez vos progrès et obtenez des insights personnalisés.',
  'settings.insights.dailySummary': 'Résumé quotidien',
  'settings.insights.dailySummaryDesc': 'Briefing matinal de vos objectifs et progrès.',
  'settings.insights.premium': 'Insights Premium',
  'settings.insights.premiumDesc': 'Soyez informé des analyses avancées et conseils.',
  'settings.notifications.pushEnabled': 'Notifications push',
  'settings.notifications.pushEnabledDesc': 'Activer toutes les notifications push',
  'settings.notifications.enabled': 'Notifications activées',
  'settings.notifications.disabled': 'Notifications désactivées',
  'settings.notifications.saved': 'Paramètres enregistrés',
  'settings.notifications.emailDigest': 'Digest e-mail',
  'settings.notifications.emailDigestDesc': 'Recevoir des résumés périodiques par e-mail',
  'settings.notifications.emailNone': 'Aucun',
  'settings.notifications.emailDaily': 'Quotidien',
  'settings.notifications.emailWeekly': 'Hebdomadaire',
  'settings.insights.achievements': 'Réalisations',
  'settings.insights.achievementsDesc': 'Célébrez les nouveaux records personnels et les étapes.',
  'settings.insights.coachInsights': 'Insights Iron Coach',
  'settings.insights.coachInsightsDesc': 'Conseils et motivation personnalisés de votre coach.',
  'settings.insights.motivational': 'Messages de motivation',
  'settings.insights.motivationalDesc': 'Messages de motivation occasionnels pour vous garder motivé.',
  'settings.frequency.title': 'Fréquence',
  'settings.frequency.description': 'Contrôlez la fréquence de vos notifications.',
  'settings.frequency.maxDaily': 'Max notifications par jour',
  'settings.frequency.maxDailyDesc': 'Maximum de notifications par jour (3-10).',
  'settings.frequency.quietHours': 'Heures calmes',
  'settings.frequency.quietHoursDesc': 'Pas de notifications pendant ces heures.',
  'appearance.theme.title': 'Thème',
  'appearance.theme.description': 'Sélectionnez votre style visuel préféré.',
  'appearance.theme.keepThis': 'Garder ce thème?',
  'appearance.theme.revert': 'Annuler',
  'appearance.theme.session': 'Session',
  'appearance.theme.save': 'Enregistrer',
  'appearance.theme.theme': 'Thème',
  'appearance.theme.customThemes': 'Thèmes personnalisés',
  'appearance.theme.saveTheme': 'Enregistrer le thème',

  'theme.light.name': 'Clair',
  'theme.light.description': 'Clarté pure. Surfaces nettes et concentration calme.',
  'theme.dark.name': 'Sombre',
  'theme.dark.description': 'Reposant pour les yeux. Tons profonds et apaisants.',
  'theme.gymbro.name': 'Gymbro',
  'theme.gymbro.description': 'MODE BÊTE. Énergie alpha. Testostérone pure.',
  'theme.gymgirl.name': 'Gymsis',
  'theme.gymgirl.description': 'Force douce. Mignon, rose et valorisant.',

  'dialog.deleteAccount.title': 'Supprimer le compte?',
  'dialog.deleteAccount.description': 'Cela supprimera définitivement votre compte et TOUTES les données associées, y compris votre profil, repas, entraînements, photos de progression et objectifs. Cette action est irréversible.',
  'dialog.deleteAccount.confirm': 'Supprimer mon compte',
  'dialog.deleteAccount.cancel': 'Annuler',
  'dialog.deleteAccount.deleting': 'Suppression...',

  'toast.theme.saved': 'Thème enregistré',
  'toast.signOut.error': 'Échec de la déconnexion',
  'toast.deleteAccount.success': 'Compte supprimé avec succès',
  'toast.deleteAccount.error': 'Échec de la suppression du compte',

  'home.greeting.morning': 'Bonjour',
  'home.greeting.afternoon': 'Bon après-midi',
  'home.greeting.evening': 'Bonsoir',
  'home.calories.consumed': 'Consommées',
  'home.calories.remaining': 'Restantes',
  'home.calories.burned': 'Brûlées',
  'home.macros.protein': 'Protéines',
  'home.macros.carbs': 'Glucides',
  'home.macros.fat': 'Lipides',
  'home.workouts.thisWeek': 'Entraînements cette semaine',
  'home.workouts.noWorkouts': "Aucun entraînement pour l'instant",
  'home.streak.label': 'Série',
  'home.streak.days': 'jours',

  'foods.title': 'Aliments',
  'foods.search.placeholder': 'Rechercher des aliments…',
  'foods.add.title': 'Ajouter un aliment',
  'foods.log.breakfast': 'Petit-déjeuner',
  'foods.log.lunch': 'Déjeuner',
  'foods.log.dinner': 'Dîner',
  'foods.log.snack': 'Collation',
  'foods.barcode.scan': 'Scanner un code-barres',
  'foods.photo.analyze': 'Analyser une photo',
  'foods.noResults': 'Aucun aliment trouvé',
  'foods.calories': 'Calories',
  'foods.protein': 'Protéines',
  'foods.carbs': 'Glucides',
  'foods.fat': 'Lipides',
  'foods.per100g': 'pour 100g',
  'foods.serving': 'Portion',
  'foods.supplements': 'Suppléments',
  'foods.hydration': 'Hydratation',
  'foods.dailyGoal': 'Objectif quotidien',
  'foods.weeklyHistory': 'Historique hebdomadaire',
  'foods.tapForHistory': 'Appuyez pour l\'historique',
  'foods.viewingHistory': 'Historique - Les nouvelles entrées seront enregistrées pour ce jour',
  'foods.noHistory': 'Aucune donnée historique disponible',
  'foods.now': 'MAINTENANT',
  'foods.selected': 'SÉLECTIONNÉ',
  'foods.kcal': 'kcal',
  'foods.noLogs': 'aucun journal',
  'foods.caloriesLeft': 'calories restantes',
  'foods.overTarget': 'dépassé',
  'foods.carbohydrates': 'Glucides',
  'foods.addFood': 'Ajouter un aliment',
  'foods.quickAdd': 'Ajout rapide',
  'foods.noFoodsLogged': 'Aucun aliment enregistré',
  'foods.tapToAdd': 'Appuyez pour ajouter',
  'foods.undoLast': 'Annuler le dernier',
  'foods.clearAll': 'Tout effacer',
  'foods.glass': 'Verre',
  'foods.bottle': 'Bouteille',
  'foods.large': 'Grand',
  'foods.goal': 'Objectif',
  'foods.insight.overTarget': 'Dépassement de',
  'foods.insight.proteinOnTrack': 'Objectif protéine atteint. Bien joué!',
  'foods.insight.addProtein': 'Ajoutez des protéines pour atteindre votre objectif.',
  'foods.insight.keepLogging': 'Continuez à enregistrer pour voir vos progrès.',
  'foods.tomorrow': 'Demain',

  'workouts.title': 'Entraînements',
  'workouts.add': 'Ajouter un entraînement',
  'workouts.start': 'Démarrer',
  'workouts.startWorkout': 'Démarrer l\'entraînement',
  'workouts.chooseActivity': 'Choisir une activité',
  'workouts.greatWorkout': 'Super entraînement!',
  'workouts.activityCompleted': 'terminé',
  'workouts.movingTime': 'Temps en mouvement',
  'workouts.elevationGain': 'Dénivelé',
  'workouts.currentPace': 'Allure actuelle',
  'workouts.lastKm': 'Dernier km',
  'workouts.avgSpeed': 'Vitesse moyenne',
  'workouts.showLess': 'Moins',
  'workouts.moreMetrics': 'Plus de métriques',
  'workouts.resume': 'Reprendre',
  'workouts.pause': 'Pause',
  'workouts.share': 'Partager',
  'workouts.saving': 'Enregistrement...',
  'workouts.importGPX': 'Importer un itinéraire GPX',
  'workouts.locationDenied': 'Autorisation de localisation refusée. Veuillez activer l\'accès à la localisation dans les paramètres de votre navigateur pour suivre les entraînements.',
  'workouts.gpsError': 'Erreur GPS',
  'workouts.online': 'En ligne',
  'workouts.offline': 'Hors ligne',
  'workouts.syncing': 'Synchronisation',
  'workouts.history': 'Historique',
  'workouts.noWorkouts': 'Aucun entraînement enregistré',
  'workouts.duration': 'Durée',
  'workouts.distance': 'Distance',
  'workouts.calories': 'Calories',
  'workouts.pace': 'Allure',
  'workouts.heartRate': 'Fréquence cardiaque',
  'workouts.type.running': 'Course',
  'workouts.type.cycling': 'Cyclisme',
  'workouts.type.swimming': 'Natation',
  'workouts.type.strength': 'Musculation',
  'workouts.type.walking': 'Marche',
  'workouts.type.yoga': 'Yoga',
  'workouts.type.other': 'Autre',
  'workouts.type.hike': 'Randonnée',
  'workouts.type.ride': 'Vélo',
  'workouts.recent': 'Entraînements récents',
  'workouts.complete': 'Entraînement terminé!',
  'workouts.paused': 'En pause',
  'workouts.laps': 'Tours',
  'workouts.lap': 'Tour',
  'workouts.save': 'Enregistrer',
  'workouts.discard': 'Annuler',
  'workouts.exportGPX': 'Exporter GPX',
  'workouts.notes': 'Notes',
  'workouts.notesPlaceholder': 'Comment s\'est passé votre entraînement?',
  'workouts.howDidItFeel': 'Comment vous sentez-vous?',
  'workouts.photos': 'Photos',
  'workouts.addPhoto': 'Ajouter une photo',
  'workouts.noPhotos': 'Pas encore de photos',
  'workouts.hrMonitor': 'Moniteur cardiaque',
  'workouts.hrTapToPair': 'Appuyez pour coupler via Bluetooth',
  'workouts.hrConnecting': 'Connexion...',
  'workouts.hrDisconnect': 'Déconnecter',
  'workouts.avgPace': 'Allure moyenne',
  'workouts.selectActivity': 'Sélectionner une activité',
  'workouts.selectActivityFirst': 'Sélectionnez d\'abord une activité',
  'workouts.startFirst': 'Commencez votre premier entraînement!',
  'workouts.min': 'MIN',
  'workouts.max': 'MAX',
  'workouts.avg': 'MOY',
  'workouts.bpm': 'BPM',
  'workouts.km': 'km',
  'workouts.pr': 'RP',
  'workouts.hrZone.recovery': 'Récupération',
  'workouts.hrZone.endurance': 'Endurance',
  'workouts.hrZone.tempo': 'Tempo',
  'workouts.hrZone.threshold': 'Seuil',
  'workouts.hrZone.vo2max': 'VO2 Max',
  'workouts.activity.run': 'Course',
  'workouts.activity.cycle': 'Vélo',
  'workouts.activity.walk': 'Marche',
  'workouts.activity.hike': 'Randonnée',
  'workouts.activity.swim': 'Natation',
  'workouts.activity.other': 'Autre',

  'profile.title': 'Profil',
  'profile.edit': 'Modifier le profil',
  'profile.goal': 'Objectif',
  'profile.weight': 'Poids',
  'profile.height': 'Taille',
  'profile.age': 'Âge',
  'profile.sex': 'Sexe',
  'profile.activityLevel': 'Niveau d\'activité',
  'profile.goal.fat_loss': 'Perte de poids',
  'profile.goal.muscle_gain': 'Gain musculaire',
  'profile.goal.recomposition': 'Recomposition',
  'profile.goal.maintenance': 'Maintien',
  'profile.goal.performance': 'Performance',
  'profile.activity.sedentary': 'Sédentaire',
  'profile.activity.light': 'Activité légère',
  'profile.activity.moderate': 'Modéré',
  'profile.activity.active': 'Actif',
  'profile.activity.very_active': 'Très actif',

  'coach.title': 'Iron Coach',
  'coach.placeholder': 'Demander à Iron Coach...',
  'coach.send': 'Envoyer',
  'coach.thinking': 'Iron Coach réfléchit…',
  'coach.error': 'Impossible d\'obtenir une réponse. Réessayez.',
  'coach.welcome': 'Je suis Iron Coach. Pas d\'excuses. De quoi avez-vous besoin?',
  'coach.menu': 'Menu',
  'coach.clearChat': 'Effacer l\'historique',
  'coach.clearing': 'Effacement...',
  'coach.clearConfirm': 'Effacer tout l\'historique? Cette action est irréversible.',
  'coach.freshStart': 'Nouveau départ! 🔄 Je suis prêt à vous aider dans votre parcours fitness. Sur quoi voulez-vous travailler? 💪',
  'coach.offlineAI': 'IA hors ligne disponible',
  'coach.download': 'Télécharger',
  'coach.pause': 'Pause',
  'coach.resume': 'Reprendre',
  'coach.cancel': 'Annuler',
  'coach.stopGenerating': 'Arrêter',
  'coach.fitnessFriend': 'Votre ami fitness',
  'coach.remembersEverything': 'Je me souviens de tout',
  'coach.loadingHistory': 'Chargement de votre historique...',
  'coach.welcomeNew': 'Salut! 👋 Je suis **Iron Coach** — votre ami et coach personnel. Je suis là pour vous aider à atteindre vos objectifs, rester motivé et profiter du parcours. Je me souviens de tout sur vous, donc à chaque conversation, on reprend là où on s\'était arrêté. Comment puis-je vous aider aujourd\'hui? 💪',

  'offline.title': 'Vous êtes hors ligne',
  'offline.subtitle': 'Les données se synchroniseront à la reconnexion',
  'offline.syncing': 'Synchronisation',
  'offline.uploading': 'Envoi des données hors ligne...',
  'offline.pending': 'en attente',
  'offline.willSync': 'Les données se synchroniseront à la reconnexion',

  'skipToContent': 'Passer au contenu principal',

  'dashboard.bodyIntelligence': 'Intelligence corporelle',
  'dashboard.dailyActions': 'Actions quotidiennes',
  'dashboard.progressMirror': 'Miroir de progression',
  'dashboard.timeline': 'Chronologie du jour',
  'dashboard.nutrition': 'Nutrition',
  'dashboard.hydration': 'Hydratation',
  'dashboard.steps': 'Pas',
  'dashboard.workout': 'Entraînement',
  'dashboard.viewHistory': 'Voir l\'historique',

  'analytics.title': 'Analyses',
  'analytics.weight.trend': 'Tendance du poids',
  'analytics.calories.trend': 'Tendance calorique',
  'analytics.workouts.trend': 'Tendance des entraînements',
  'analytics.noData': 'Pas assez de données pour afficher les tendances',

  'onboarding.welcome': 'Bienvenue sur Progress Companion',
  'onboarding.goal.title': 'Quel est votre objectif principal?',
  'onboarding.units.title': 'Choisissez vos unités',
  'onboarding.complete': 'Commencer',

  // Home page insights (French)
  'home.insight.peakState': 'Votre corps est au top aujourd\'hui',
  'home.insight.solidProgress': 'Bonne progression — gardez le rythme',
  'home.insight.startSmall': 'Chaque action compte. Commencez petit.',
  'home.insight.ready': 'Prêt quand vous l\'êtes.',
  'home.insight.streak': ' jours consécutifs — continuez !',
  'home.insight.incredibleStreak': 'Incroyable série de  jours !',
  'home.defaultGoalWarning': '⚠️ Objectif par défaut. Définissez votre objectif dans le Profil.',
  'home.trendingLeaner': 'Tendance plus mince',
  'home.buildingStrength': 'Développement musculaire',
  'home.stableProgress': 'Progression stable',
  'home.comingSoon': 'Bientôt disponible',
  'home.customTarget': 'Objectif personnalisé',
  'home.autoTarget': 'Objectif auto',
  'home.startLogging': 'Commencez à enregistrer vos repas',
  'home.excellentMomentum': 'Excellent élan. Votre corps répond bien à votre routine.',
  'home.steadyProgress': 'Progression régulière. Concentrez-vous sur le timing des protéines.',
  'home.smallWins': 'Commencez par de petites victoires. Même une courte marche vous fait avancer.',
  'home.noWorkoutToday': 'Pas d\'entraînement aujourd\'hui',
  'home.workoutCalories': 'Entraînement : {calories} cal brûlées',
  'home.goalDefault': 'Objectif : défaut (maintien)',
  'home.goalUserDefined': 'Objectif : personnalisé',
  'home.refreshError': 'Certaines données n\'ont pas pu être actualisées.',
  'home.refreshErrorConnection': 'Échec de l\'actualisation. Vérifiez votre connexion.',
  'home.refreshErrorPartial': 'Certaines données n\'ont pas pu être actualisées.',
  'home.refreshErrorUnexpected': 'Une erreur inattendue s\'est produite. Veuillez réessayer.',
  'home.over': 'DÉPASSÉ',
  'home.low': 'BAS',
  'home.kcalOverGoal': '{value} kcal de plus que l\'objectif',
  'home.kcalRemaining': '{value} kcal restantes',
  'home.dailyGoal': 'sur {value} kcal objectif quotidien',
  'home.protein': 'Protéines',
  'home.carbs': 'Glucides',
  'home.fat': 'Lipides',
  'home.todaysFuel': "Carburant du jour",
  // Workouts Page
  'workouts.chooseActivity': 'Choisir une activité',
  'workouts.readyToTrack': 'Prêt à enregistrer votre entraînement ?',
  'workouts.start': 'Démarrer',
  'workouts.autoPauseGps': 'Pause auto activée • GPS actif',
  'workouts.bleHeartRate': 'Fréquence cardiaque BLE',
  'workouts.connected': 'Connecté',
  'workouts.optional': 'Optionnel',
  'workouts.photoAttach': 'Joindre photo',
  'workouts.duringWorkout': 'Pendant l\'entraînement',
  'workouts.routeFollowing': 'Suivi d\'itinéraire',
  'workouts.liveMap': 'Carte en direct',
  'workouts.offlineReady': 'Mode hors ligne',
  'workouts.cachedMaps': 'Cartes en cache',
  'workouts.gpsError': 'Erreur GPS',
  'workouts.controlsLocked': 'Commandes verrouillées',
  'workouts.tapToLock': 'Appuyer pour verrouiller',
  'workouts.connecting': 'Connexion...',
  'workouts.tapToPair': 'Appuyer pour associer via Bluetooth',
  'workouts.run': 'Course',
  'workouts.ride': 'Vélo',
  'workouts.walk': 'Marche',
  'workouts.hike': 'Randonnée',
  'workouts.swim': 'Natation',
  'workouts.other': 'Autre',
  // Analytics/Intelligence Page (French)
  'analytics.title': 'Intelligence',
  'analytics.loading': 'Chargement de vos données...',
  'analytics.welcome': 'Bienvenue dans votre Hub Intelligence',
  'analytics.startTracking': 'Commencez à suivre votre progression pour voir des insights personnalisés.',
  'analytics.weight': 'Poids',
  'analytics.bodyFat': 'Masse grasse',
  'analytics.leanMass': 'Masse maigre',
  'analytics.calories': 'Calories',
  'analytics.training': 'Entraînement',
  'analytics.recovery': 'Récupération',
  'analytics.metric': 'Métrique',
  'analytics.trackBodyWeight': 'Suivre le poids',
  'analytics.fatPercentage': 'Pourcentage de graisse',
  'analytics.muscleMass': 'Masse musculaire',
  'analytics.dailyIntake': 'Apport quotidien',
  'analytics.workoutActivity': 'Activité sportive',
  'analytics.calorieBalance': 'Équilibre calorique',
  'analytics.logMoreData': 'Enregistrer plus de données',
  'analytics.weightStable': 'Poids stable',
  'analytics.weightUp': 'Poids en hausse',
  'analytics.weightDown': 'Poids en baisse',
  'analytics.bodyFatDown': 'Masse grasse en baisse',
  'analytics.bodyFatUp': 'Masse grasse en hausse',
  'analytics.bodyFatStable': 'Masse grasse stable',
  'analytics.buildingMuscle': 'Développement musculaire',
  'analytics.muscleDeclining': 'Masse musculaire en baisse',
  'analytics.muscleMaintained': 'Masse musculaire maintenue',
  'analytics.calorieIntake': 'Votre apport calorique',
  'analytics.trainingActivity': 'Votre activité sportive',
  'analytics.recoveryStatus': 'Votre état de récupération',
  'analytics.performanceIntelligence': 'Intelligence de performance',
  // Profile Page (French)
  'profile.editProfile': 'Modifier le profil',
  'profile.moreOptions': 'Plus d\'options',
  'profile.settings': 'Paramètres',
  'profile.signOut': 'Déconnexion',
  'profile.resetEverything': 'Tout réinitialiser',
  'profile.deleteAccount': 'Supprimer le compte',
  'profile.uploadAvatar': 'Télécharger un avatar',
  'profile.changeAvatar': 'Changer l\'avatar',
  'profile.yourName': 'Votre nom',
  'profile.currentWeight': 'Poids actuel',
  'profile.targetWeight': 'Poids cible',
  'profile.height': 'Taille',
  'profile.age': 'Âge',
  'profile.gender': 'Genre',
  'profile.goal': 'Objectif',
  'profile.activityLevel': 'Niveau d\'activité',
  'profile.dailyCalorieTarget': 'Objectif calorique quotidien',
  'profile.autoCalculation': 'Laisser vide pour un calcul automatique',
  'profile.excellent': 'Excellent !',
  'profile.goodProgress': 'Bonne progression',
  'profile.keepTracking': 'Continuez !',
  'profile.consistency': 'Régularité',
  'profile.progressPhotos': 'Photos de progression',
  'profile.addPhoto': 'Ajouter une photo',
  'profile.bodyComposition': 'Composition corporelle',
  'profile.streak': 'Série',
  'profile.days': 'jours',
  'profile.level': 'Niveau',
  'profile.buildingHabits': 'Construire de meilleures habitudes, jour après jour',
  'profile.xpProgress': 'Progression XP',
  'profile.myAccount': 'Mon compte',
  'profile.improving': 'en progression',
  'profile.stable': 'stable',
  'profile.declining': 'en baisse',
  'profile.weightTrendingDown': 'Poids en baisse',
  'profile.weightTrendingUp': 'Poids en hausse',
  'profile.keepLogging': 'Continuez à enregistrer vos repas et entraînements pour voir vos progrès.',
  'profile.trainingStats': 'Statistiques d\'entraînement',
  'profile.workouts': 'Entraînements',
  'profile.daysTracked': 'Jours suivis',
  'profile.consistencyScore': 'Score de régularité',
  'profile.consistencyExcellent': 'Excellent ! Suivi presque quotidien.',
  'profile.consistencyGood': 'Bonne progression ! Continuez à construire l\'habitude.',
  'profile.consistencyBuilding': 'Construction d\'habitudes. Essayez de suivre quotidiennement.',
  'profile.consistencyStart': 'Commencez à suivre repas, entraînements ou poids pour développer la régularité.',
  'profile.identitySnapshot': 'Aperçu d\'identité',
  'profile.export': 'Exporter',
  'profile.totalXP': 'XP Total',
  'profile.nutritionScore': 'Score nutritionnel',
  'profile.photos': 'Photos',
  'profile.meals': 'Repas',
  'profile.excellentTracking': 'Excellent ! Suivi presque quotidien.',
  'profile.goodProgressHabit': 'Bonne progression ! Continuez à construire l\'habitude.',
  'profile.buildingHabitsDaily': 'Construction d\'habitudes. Essayez de suivre quotidiennement.',
  'profile.startTracking': 'Commencez à suivre repas, entraînements ou poids pour développer la régularité.',
};

// ════════════════════════════════════════════════════════════════
// Translation map + lookup
// ════════════════════════════════════════════════════════════════
export const TRANSLATIONS: Record<Locale, Record<TranslationKey, string>> = { en, fr };

/**
 * Resolve a translation key for a given locale.
 * Falls back to English if the key is missing in the requested locale.
 */
export function resolveTranslation(key: TranslationKey, locale: Locale): string {
  return TRANSLATIONS[locale]?.[key] ?? TRANSLATIONS['en'][key] ?? key;
}

/** RTL locales (none for en/fr) */
export const RTL_LOCALES: ReadonlySet<Locale> = new Set([]);

/** Check if a locale is RTL */
export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.has(locale);
}

/** Get the BCP-47 language tag for a locale (used in html lang attribute and Intl APIs) */
export const LOCALE_BCP47: Record<Locale, string> = {
  en: 'en-US',
  fr: 'fr-FR',
};
