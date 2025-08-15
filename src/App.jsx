import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import ReactMarkdown from 'react-markdown';

// Main App component
const App = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [itinerary, setItinerary] = useState(null);
  
  // Chatbot states
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatMessagesEndRef = useRef(null);
  const [isAITyping, setIsAITyping] = useState(false);

  // State for the trip planning form
  const [tripDetails, setTripDetails] = useState({
    fromAddress: '',
    destination: '',
    startDate: '',
    endDate: '',
    budget: 20000, // Changed default budget to INR
    travelStyle: [],
  });

  const travelStyles = ['Adventure', 'Relaxation', 'Cultural', 'Foodie', 'Budget-Friendly', 'Luxury'];

  // Function to handle theme toggling and save to local storage
  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    localStorage.setItem('theme', isDarkMode ? 'light' : 'dark');
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
    }
    // Load Poppins font
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, isAITyping]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setTripDetails(prev => ({ ...prev, [name]: value }));
  };

  const handleStyleToggle = (style) => {
    setTripDetails(prev => {
      const newStyles = prev.travelStyle.includes(style)
        ? prev.travelStyle.filter(s => s !== style)
        : [...prev.travelStyle, style];
      return { ...prev, travelStyle: newStyles };
    });
  };

  const handlePlanTrip = async () => {
    // Reset state and show loading
    setItinerary(null);
    setIsPlanning(true);

    // API configuration
    const apiKey = process.env.REACT_APP_VITE_GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    // Construct the dynamic prompt for the AI
    const prompt = `
      Create a realistic and detailed travel itinerary. 
      The trip is from ${tripDetails.fromAddress || 'a starting location'} to ${tripDetails.destination || 'a new destination'}.
      The trip dates are from ${tripDetails.startDate} to ${tripDetails.endDate}.
      The budget is approximately INR ${tripDetails.budget}.
      The traveler's style is focused on: ${tripDetails.travelStyle.length > 0 ? tripDetails.travelStyle.join(', ') : 'a balanced mix of everything'}.
      Please provide a comprehensive itinerary that includes the travel from the starting point to the destination, as well as the day-by-day activities at the destination.
      Please provide the itinerary as a JSON object with the following structure. 
      The 'days' array should contain one object for each day of the trip. The first day should always be titled "Travel to Destination" and provide details on transportation and cost in INR.
    `;

    // Define the JSON schema for the API to follow
    const responseSchema = {
      type: "OBJECT",
      properties: {
        destination: { type: "STRING" },
        days: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              day: { type: "NUMBER" },
              title: { type: "STRING" },
              activities: {
                type: "ARRAY",
                items: { type: "STRING" }
              },
              cost: { type: "NUMBER" }
            },
            "propertyOrdering": ["day", "title", "activities", "cost"]
          }
        }
      },
      "propertyOrdering": ["destination", "days"]
    };

    const payload = {
      contents: [{
        role: "user",
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    };
    
    // Function to perform the fetch with exponential backoff
    const callApiWithBackoff = async (retries = 0) => {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`API call failed with status: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
              const jsonString = result.candidates[0].content.parts[0].text;
              const parsedJson = JSON.parse(jsonString);
              setItinerary(parsedJson);
        } else {
          console.error('Unexpected API response structure:', result);
          setItinerary({
            destination: "Planning Failed",
            days: [{ day: 1, title: "Error", activities: ["Could not generate itinerary. Please try again."], cost: 0 }]
          });
        }
      } catch (error) {
        console.error('Fetch error:', error);
        if (retries < 3) {
          const delay = Math.pow(2, retries) * 1000;
          console.log(`Retrying in ${delay / 1000} seconds...`);
          await new Promise(res => setTimeout(res, delay));
          await callApiWithBackoff(retries + 1);
        } else {
          setItinerary({
            destination: "Planning Failed",
            days: [{ day: 1, title: "Error", activities: ["Could not connect to the planning service. Please check your network and try again."], cost: 0 }]
          });
        }
      } finally {
        setIsPlanning(false);
      }
    };
    
    await callApiWithBackoff();
  };

  const handleChatSend = async () => {
    if (!chatInput.trim()) return;
    
    const userMessage = { role: 'user', text: chatInput };
    const initialChatHistory = [...chatHistory, userMessage];
    setChatHistory(initialChatHistory);
    setChatInput('');
    setIsAITyping(true);

    // AI response logic
    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const historyForApi = initialChatHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    const systemPrompt = `You are a helpful travel assistant. Please answer questions in a clear and concise manner, using headings, subheadings, bullet points, and relevant emojis where appropriate. If you are suggesting a booking or a place, include a link to a related search on a major platform like Google, Skyscanner, or Booking.com for further information. Use markdown for all formatting.`;
    
    const payload = {
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }, ...historyForApi]
    };

    const callApiWithBackoff = async (retries = 0) => {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`API call failed with status: ${response.status}`);
        }

        const result = await response.json();
        const botResponse = result.candidates[0]?.content?.parts[0]?.text || "Sorry, I couldn't process that. Please try again.";
        setChatHistory(prev => [...prev, { role: 'model', text: botResponse }]);

      } catch (error) {
        console.error('Fetch error:', error);
        if (retries < 3) {
          const delay = Math.pow(2, retries) * 1000;
          await new Promise(res => setTimeout(res, delay));
          await callApiWithBackoff(retries + 1);
        } else {
          setChatHistory(prev => [...prev, { role: 'model', text: "I'm having trouble connecting to my service. Please try again later." }]);
        }
      } finally {
        setIsAITyping(false);
      }
    };

    await callApiWithBackoff();
  };


  const heroVariants = {
    hidden: { opacity: 0, y: -20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: 'easeOut' } },
  };

  const sidebarVariants = {
    open: { x: 0, transition: { type: 'spring', stiffness: 200, damping: 20 } },
    closed: { x: '-100%', transition: { type: 'spring', stiffness: 200, damping: 20 } },
  };

  // Budget chart data calculation
  const getBudgetChartData = () => {
    if (!itinerary) return [];
    return itinerary.days.map(day => ({
      name: `Day ${day.day}`,
      cost: day.cost,
    }));
  };

  const totalCost = itinerary?.days.reduce((sum, day) => sum + day.cost, 0) || 0;
  const budgetData = getBudgetChartData();
  const COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#6366F1', '#EC4899'];
  
  return (
    <div className={`font-poppins ${isDarkMode ? 'dark' : ''} min-h-screen bg-gray-100 text-gray-800 dark:bg-slate-900 dark:text-gray-200 transition-colors duration-500`}>
      {/* Main Container */}
      <div className="relative min-h-screen flex flex-col">
        
        {/* Sidebar for mobile */}
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.div
              initial="closed"
              animate="open"
              exit="closed"
              variants={sidebarVariants}
              className="fixed inset-y-0 left-0 w-64 bg-white dark:bg-slate-800 shadow-xl z-50 p-6 flex flex-col space-y-6 lg:hidden"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Smart Trip Planner</h2>
                <button onClick={() => setIsSidebarOpen(false)} className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <nav className="flex flex-col space-y-2 text-gray-700 dark:text-gray-300">
                <a href="#" className="flex items-center gap-2 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3c3.08 0 5.5 2.42 5.5 5.5 0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg> Destinations
                </a>
                <a href="#" className="flex items-center gap-2 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3c3.08 0 5.5 2.42 5.5 5.5 0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg> My Trips
                </a>
                <a href="#" className="flex items-center gap-2 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Community
                </a>
                <a href="#" className="flex items-center gap-2 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg> Settings
                </a>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg shadow-sm">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden text-gray-800 dark:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <motion.a 
                href="#" 
                className="text-2xl font-bold text-gray-900 dark:text-white"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
              >
                Smart Trip Planner
              </motion.a>
            </div>
            
            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center space-x-6 text-gray-700 dark:text-gray-100">
              <a href="#" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Destinations</a>
              <a href="#" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">My Trips</a>
              <a href="#" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Community</a>
              <a href="#" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">About Us</a>
            </nav>

            <div className="flex items-center space-x-4">
              <motion.button 
                onClick={toggleTheme} 
                className="p-2 rounded-full bg-gray-200 dark:bg-slate-700 text-gray-800 dark:text-white transition-colors duration-300"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                {isDarkMode ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M4.93 4.93l1.41 1.41"></path><path d="M17.66 17.66l1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="M4.93 19.07l1.41-1.41"></path><path d="M17.66 6.34l1.41-1.41"></path></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>
                )}
              </motion.button>
              <motion.button 
                className="px-4 py-2 bg-blue-600 text-white rounded-full font-semibold shadow-md hover:bg-blue-700 transition-colors duration-300"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Sign In
              </motion.button>
            </div>
          </div>
        </header>

        {/* Hero Section with Planning Form */}
        <main className="container mx-auto px-4 py-16 flex-grow bg-white dark:bg-slate-900">
          <motion.div
            variants={heroVariants}
            initial="hidden"
            animate="visible"
            className="text-center mb-12"
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4 text-gray-900 dark:text-white">
              Your Next Adventure, <br className="hidden md:inline" /> Planned by AI
            </h1>
            <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Smart Trip Planner crafts your perfect trip with a touch of magic.
            </p>
          </motion.div>

          {/* Trip Planning Form */}
          <motion.div
            className="bg-gray-50 dark:bg-slate-800 p-8 rounded-3xl shadow-xl max-w-4xl mx-auto"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <h3 className="text-2xl font-bold mb-6 text-center text-gray-900 dark:text-white">Plan Your Trip</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-100 mb-2">From Address</label>
                <input
                  type="text"
                  name="fromAddress"
                  value={tripDetails.fromAddress}
                  onChange={handleChange}
                  placeholder="e.g., Mumbai, Delhi, Bangalore"
                  className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 text-gray-800 dark:text-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-100 mb-2">Destination</label>
                <input
                  type="text"
                  name="destination"
                  value={tripDetails.destination}
                  onChange={handleChange}
                  placeholder="e.g., Jaipur, Goa, Kerala"
                  className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 text-gray-800 dark:text-white transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-100 mb-2">Start Date</label>
                <input
                  type="date"
                  name="startDate"
                  value={tripDetails.startDate}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 text-gray-800 dark:text-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-100 mb-2">End Date</label>
                <input
                  type="date"
                  name="endDate"
                  value={tripDetails.endDate}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 text-gray-800 dark:text-white transition-colors"
                />
              </div>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-100 mb-2">Budget (INR)</label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  name="budget"
                  min="5000"
                  max="100000"
                  step="1000"
                  value={tripDetails.budget}
                  onChange={handleChange}
                  className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer focus:outline-none"
                />
                <span className="text-lg font-bold min-w-[70px] text-right text-gray-900 dark:text-white">₹{tripDetails.budget.toLocaleString()}</span>
              </div>
            </div>

            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-100 mb-2">Travel Style</label>
              <div className="flex flex-wrap gap-2">
                {travelStyles.map(style => (
                  <motion.button
                    key={style}
                    onClick={() => handleStyleToggle(style)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      tripDetails.travelStyle.includes(style)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {style}
                  </motion.button>
                ))}
              </div>
            </div>
            
            <motion.button
              onClick={handlePlanTrip}
              className="w-full px-8 py-4 bg-yellow-500 text-white rounded-full font-semibold shadow-lg hover:bg-yellow-600 transition-colors duration-300"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isPlanning ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Planning...
                </div>
              ) : (
                'Start Planning'
              )}
            </motion.button>
          </motion.div>

          {/* Itinerary Display Section */}
          <AnimatePresence>
            {itinerary && (
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -50 }}
                transition={{ duration: 0.6 }}
                className="mt-16"
              >
                <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl max-w-4xl mx-auto">
                  <h3 className="text-3xl font-bold mb-4 text-center text-gray-900 dark:text-white">{itinerary.destination} Itinerary</h3>
                  
                  {/* Budget Summary */}
                  <div className="mb-8 p-6 bg-gray-100 dark:bg-slate-700 rounded-2xl">
                    <h4 className="text-xl font-semibold text-blue-600 dark:text-blue-400 mb-4">Budget Summary</h4>
                    <div className="flex flex-col md:flex-row items-center justify-between">
                      <div className="w-full md:w-1/2 flex flex-col items-center">
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={budgetData}
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="cost"
                              labelLine={false}
                              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                            >
                              {budgetData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="w-full md:w-1/2 mt-4 md:mt-0 md:ml-8">
                        <p className="text-lg font-bold text-gray-900 dark:text-white">Total Itinerary Cost: <span className="text-blue-600">₹{totalCost.toLocaleString()}</span></p>
                        <p className={`text-sm mt-2 font-medium ${totalCost > tripDetails.budget ? 'text-red-500' : 'text-green-500'}`}>
                          Budget: ₹{tripDetails.budget.toLocaleString()}
                        </p>
                        <p className={`text-sm mt-1 font-medium ${totalCost > tripDetails.budget ? 'text-red-500' : 'text-green-500'}`}>
                          Status: {totalCost > tripDetails.budget ? 'Over Budget' : 'Within Budget'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Day-by-Day Itinerary */}
                  {itinerary.days.map(day => (
                    <div key={day.day} className="mb-8 p-6 bg-gray-100 dark:bg-slate-700 rounded-2xl">
                      <h4 className="text-xl font-semibold text-blue-600 dark:text-blue-400 mb-2">Day {day.day}: {day.title}</h4>
                      <ul className="list-disc list-inside space-y-1 text-gray-900 dark:text-white">
                        {day.activities.map((activity, index) => (
                          <li key={index}>{activity}</li>
                        ))}
                      </ul>
                      <p className="mt-4 text-sm font-medium text-gray-500 dark:text-gray-400">Estimated Cost: ₹{day.cost}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
        
        {/* Chatbot Floating Button and Window */}
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', duration: 0.5 }}
              className="fixed bottom-24 right-4 z-50 w-80 h-96 bg-white dark:bg-slate-800 rounded-2xl shadow-xl flex flex-col"
            >
              <div className="flex justify-between items-center p-4 bg-blue-600 text-white rounded-t-2xl">
                <h4 className="font-bold">✨ AI Trip Assistant</h4>
                <button onClick={() => setIsChatOpen(false)} className="text-white hover:text-gray-200">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
                {chatHistory.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`p-3 rounded-xl max-w-[80%] ${
                      msg.role === 'user'
                        ? 'bg-blue-100 dark:bg-blue-900 text-gray-800 dark:text-white'
                        : 'bg-gray-200 dark:bg-slate-700 text-gray-800 dark:text-white'
                    }`}>
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  </div>
                ))}
                {isAITyping && (
                  <div className="flex justify-start">
                    <div className="p-3 rounded-xl max-w-[80%] bg-gray-200 dark:bg-slate-700 text-gray-800 dark:text-white animate-pulse">
                      ...
                    </div>
                  </div>
                )}
                <div ref={chatMessagesEndRef} />
              </div>
              <div className="p-4 border-t dark:border-slate-700">
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                    placeholder="Ask me anything..."
                    className="flex-1 px-4 py-2 rounded-full bg-gray-100 dark:bg-slate-700 focus:outline-none text-gray-800 dark:text-white"
                  />
                  <motion.button
                    onClick={handleChatSend}
                    className="p-2 bg-yellow-500 text-white rounded-full"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="fixed bottom-4 right-4 z-50 p-4 bg-blue-600 text-white rounded-full shadow-lg"
          whileHover={{ scale: 1.1, rotate: 10 }}
          whileTap={{ scale: 0.9 }}
        >
          {isChatOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="m3 21 1.9-2C8.8 15.1 11 14 14 14s5.2 1.1 7.1 3l1.9 2"></path><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          )}
        </motion.button>

        {/* Footer */}
        <footer className="bg-gray-100 dark:bg-slate-800 py-8">
          <div className="container mx-auto px-4 text-center text-gray-600 dark:text-gray-400">
            <p>&copy; 2024 Smart Trip Planner. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
