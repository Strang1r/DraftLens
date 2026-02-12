import { createBrowserRouter } from 'react-router-dom'
import HomePage1 from '../pages/HomePage1'
import Edit1 from '../pages/Edit1'
import Final1 from '../pages/Final1'
import Prompt from '../pages/Prompt'
import Condition6 from '../pages/Condition6'
import Condition5 from '../pages/Condition5'
import Condition4 from '../pages/Condition4'
import Condition3 from '../pages/Condition3'
import Condition2 from '../pages/Condition2'
import Condition1 from '../pages/Condition1'

export const router = createBrowserRouter([
  { path: '/', element: <Prompt /> },
  { path: '/select', element: <HomePage1 /> },
  { path: '/edit', element: <Edit1 /> },
  { path: '/final', element: <Final1 /> },
  { path: '/condition1', element: <Condition1 /> },
  { path: '/condition2', element: <Condition2 /> },
  { path: '/condition3', element: <Condition3 /> },
  { path: '/condition4', element: <Condition4 /> },
  { path: '/condition5', element: <Condition5 /> },
  { path: '/condition6', element: <Condition6 /> },
])
