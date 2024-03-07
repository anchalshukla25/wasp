export function config() {
  console.log('Inside user-supplied Google config')
  return {
    scope: ['profile', 'email'],
  }
}

export const userSignupFields = {}
