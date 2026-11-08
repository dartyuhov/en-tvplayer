export const guideTime = (instant) => new Date(instant).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const guideTimes = (programme) => guideTime(programme.start) + '–' + guideTime(programme.end);
