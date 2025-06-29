# 🎲 Board Game Picker

A beautiful, modern web application that helps you discover your next board game adventure by intelligently selecting from your BoardGameGeek collection with advanced filtering, weighting systems, and personal rating integration.

![Status](https://img.shields.io/badge/Status-Live-brightgreen)
[![Board Game Picker Live](https://img.shields.io/badge/🎲_Try_It_Live-brightgreen?style=for-the-badge)](https://sl4ppy.github.io/BoardGameSelector/)


## ✨ Features

### 🎯 **Intelligent Game Selection**
- 🎲 **Multiple Selection Methods**: Choose how games are picked
  - **⚖️ Random**: Equal probability for all games
  - **⏰ Favor Old**: Games played longer ago get higher selection weights
  - **✨ Favor Unplayed**: Strongly favors unplayed games, falls back to recency
- 📊 **Personal Rating Integration**: Factor in your BGG ratings when selecting games
- 🎚️ **Minimum Rating Slider**: Set minimum personal rating threshold (1-10 scale)
- 🔍 **Unrated Games Control**: Choose whether to include games you haven't rated

### 🎨 **Modern Beautiful Interface**
- 🌌 **Cosmic Design**: Animated gradient background with glassmorphism effects
- 📱 **Mobile Optimized**: Touch-friendly interface with responsive design
- ✨ **Smooth Animations**: Micro-interactions and transitions throughout
- 🖼️ **Enhanced Game Cards**: Beautiful display with dual rating system
- 🎪 **Visual Feedback**: Loading states, hover effects, and button animations

### 🔄 **Smart Collection Management**
- 🔄 **Collection Sync**: Automatically fetch and cache your BGG collection
- 💾 **Intelligent Caching**: 24-hour cache with persistent local development
- 🕒 **Rate Limiting Protection**: Built-in cooldown to prevent API abuse
- 🌐 **Robust CORS Handling**: Multiple proxy fallbacks for reliability
- 📊 **Play History Integration**: Fetches last played dates from BGG Plays API

### 🎯 **Advanced Filtering**
- 👥 **Player Count**: Filter by exact player count or 5+ players
- ⏱️ **Play Time**: Quick (0-30), Medium (30-60), Long (1-2h), Epic (2h+)
- 🧩 **Complexity**: Light to Very Heavy (BGG weight scale)
- 📦 **Game Type**: Owned games vs Wishlist items
- ⭐ **Rating Display**: Shows both your personal rating and BGG community rating

### 📊 **Real-Time Statistics**
- 📈 **Weight Information**: Live stats about current filtering and weighting
- 🎯 **Selection Insights**: Average recency, unplayed count, rating statistics
- 🔢 **Filtered Count**: Shows how many games match current filters
- 📊 **Rating Analytics**: Displays rating distributions and averages

## 🚀 Live Demo

**🌟 [Try the Board Game Picker Live!](https://sl4ppy.github.io/BoardGameSelector/) 🌟**

Visit the live application: https://sl4ppy.github.io/BoardGameSelector/

## 📋 How to Use

### 🔄 **Getting Started**
1. **Enter Your BGG Username**: Input your BoardGameGeek username in the text field
2. **Sync Collection**: Click "Sync Collection" to fetch your games (cached for 24 hours)

### 🎯 **Customizing Selection**
3. **Choose Selection Method**: 
   - **⚖️ Random**: All games have equal chance
   - **⏰ Favor Old**: Prioritizes games you haven't played recently
   - **✨ Favor Unplayed**: Strongly favors games you've never played

4. **Personal Rating Options** (Optional):
   - ☑️ **Enable Personal Ratings**: Factor in your BGG ratings for selection
   - 🎚️ **Set Minimum Rating**: Use slider to set minimum rating threshold
   - 🔍 **Include Unrated**: Choose whether to include games you haven't rated

### 🔍 **Filtering Your Collection**
5. **Apply Filters**: Use the filter options to narrow down your game selection:
   - **👥 Player Count** (1-5+ players)
   - **⏱️ Play Time** (Quick, Medium, Long, Epic)
   - **🧩 Complexity** (Light to Very Heavy)
   - **📦 Game Type** (Owned vs Wishlist)

### 🎲 **Rolling for Games**
6. **Roll the Dice**: Click the dice button to get an intelligently selected game
7. **View Results**: See game details including:
   - ⭐ **Your Personal Rating** & 🎯 **BGG Community Rating**
   - 🎮 **Play History** (number of plays, last played date)
   - 📊 **Game Statistics** (players, time, complexity)
8. **Roll Again**: Use the "Roll Again" button for another selection

## 🎨 Design Highlights

### 🌌 **Visual Design**
- **Cosmic Background**: Flowing 3-color gradient animation
- **Glassmorphism**: Translucent cards with backdrop blur effects
- **Modern Typography**: Inter font with gradient text effects
- **Responsive Layout**: Adapts beautifully from desktop to mobile

### 📱 **Mobile Optimization**
- **Touch-Friendly**: Minimum 44px touch targets, up to 64px for primary actions
- **Progressive Enhancement**: 4 responsive breakpoints for all screen sizes
- **Accessibility**: High contrast mode, reduced motion support, large text scaling
- **Intuitive Navigation**: Stacked layouts on small screens to prevent accidental taps

## 🛠️ Installation & Deployment on GitHub Pages

### 🌟 **Branching Strategy**
This project uses a **dual-branch workflow** for safe development:
- **`main`** - Production branch (live site)
- **`dev`** - Development branch (for making changes)

📖 **See [WORKFLOW.md](WORKFLOW.md) for detailed development guidelines**

### Option 1: Fork this Repository

1. Fork this repository to your GitHub account
2. Go to your forked repository's Settings
3. Scroll down to "Pages" section
4. Under "Source", select "Deploy from a branch"
5. Choose "main" branch and "/ (root)" folder
6. Click "Save"
7. Your site will be available at `https://yourusername.github.io/BoardGameSelector`

### Option 2: Create New Repository

1. Create a new repository on GitHub
2. Clone it locally:
   ```bash
   git clone https://github.com/yourusername/your-repo-name.git
   cd your-repo-name
   ```
3. Copy all files from this project to your repository
4. Commit and push:
   ```bash
   git add .
   git commit -m "Initial commit: Board Game Picker"
   git push origin main
   ```
5. Enable GitHub Pages in repository settings (same as Option 1, steps 2-7)

### Option 3: Local Development

1. Clone or download this repository
2. Open `index.html` in your web browser
3. The application will work locally without any server setup

## 🏗️ Project Structure

```
BoardGameSelector/
├── index.html          # Main HTML structure
├── style.css           # Modern CSS styling
├── script.js           # Core JavaScript functionality
└── README.md           # Documentation
```

## 🔧 Technical Details

### 🎯 **Weighting Algorithm**
- **Recency Weighting**: Exponential curve favoring older games (1 day = 1.1x, 1 week = 1.7x, 1 month = 4x, 1 year = 16x, 2+ years = 25x max)
- **Rating Multipliers**: Personal ratings apply 0.3x-3.0x multipliers (9-10★ = 3x, below 3★ = 0.3x)
- **Unplayed Bonus**: Unplayed games receive 5x-10x weight depending on selection method

### 🌐 **BGG API Integration**
- **Collection API**: Fetches game details with personal ratings and play counts
- **Plays API**: Retrieves last played dates for recency calculations
- **Multiple CORS Proxies**: AllOrigins, CodeTabs, CORSProxy.io, ThingProxy for reliability
- **Error Handling**: Categorizes failures as rate limiting, CORS issues, or temporary problems

### 💾 **Advanced Caching**
- **Persistent Development Cache**: Never expires when running locally
- **Production Cache**: 24-hour expiration for live deployments
- **Play Data Cache**: Separate cache for last played dates
- **Rate Limiting**: 1-minute cooldown between collection refreshes

### 📊 **Rating System**
- **Dual Ratings**: Displays both personal ratings and BGG community averages
- **Robust Validation**: Handles null, undefined, NaN, and 0 ratings consistently
- **Smart Filtering**: Independent unrated games filtering system

## 🎨 Customization

### 🌈 **Design System**
The app uses CSS custom properties for easy theming:
```css
/* Color Palette */
--primary: #6366f1;     /* Indigo */
--secondary: #ec4899;   /* Pink */
--accent: #06b6d4;      /* Cyan */
--success: #10b981;     /* Emerald */

/* Gradients */
--gradient-cosmic: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
--gradient-primary: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

### 🎯 **Selection Methods**
Add new weighting methods by:
1. Adding button in HTML with `data-weight` attribute
2. Extending `calculateGameWeight()` method in `script.js`
3. Adding case in switch statement for new weighting logic

## 🐛 Troubleshooting

### Common Issues

**"No games found" error:**
- Verify BGG username is correct and collection is public
- Check if you have rated games (if using personal rating filters)
- Try adjusting filters or minimum rating threshold

**Rate limiting errors:**
- Wait 1 minute between collection refreshes (cooldown protection)
- Multiple failed requests may trigger temporary rate limiting
- CORS proxy failures often indicate rate limiting

**Images not loading:**
- BGG images may have CORS restrictions or be temporarily unavailable
- Game cards will show placeholders when images fail to load

### 🛠️ **Debug Functions**
Open browser console and use:
```javascript
// Clear all cached data
window.debugBGP.clearCache()

// View cached collection data
window.debugBGP.getCache()

// Test API connectivity
window.debugBGP.testProxies()
```

## 🤝 Contributing

This project follows a **dual-branch workflow** for safe development:

### **Quick Start for Contributors**
```bash
# Clone and setup
git clone https://github.com/sl4ppy/BoardGameSelector.git
cd BoardGameSelector
git checkout dev

# Make changes on dev branch
git add .
git commit -m "Add: your feature description"
git push origin dev
```

### **Full Workflow**
1. **Development**: Work on the `dev` branch
2. **Testing**: Test thoroughly before deploying
3. **Production**: Merge `dev` → `main` for live deployment
4. **Deployment**: `main` branch automatically deploys to GitHub Pages

📋 **See [WORKFLOW.md](WORKFLOW.md) for complete development guidelines**

## 📝 Version History

### v1.5.3 (Latest)
- 🔧 **Fixed**: Robust unrated games filtering for all rating states
- 🎯 **Enhanced**: Rating validation throughout codebase
- 🐛 **Fixed**: Include unrated games checkbox now works independently

### v1.5.2
- 🔍 **Fixed**: CORS proxy error handling and "Body consumed" errors
- 🌐 **Enhanced**: Better proxy fallback system

### v1.5.1
- ⏱️ **Added**: Rate limiting protection with user-friendly warnings
- 🛡️ **Enhanced**: Cooldown system prevents API abuse

### v1.5.0
- ⭐ **Added**: Dual rating display (personal + BGG community ratings)
- 🎯 **Enhanced**: Better rating parsing from BGG API

### v1.4.0
- 📊 **Added**: Personal rating integration and weighting system
- 🎚️ **Added**: Minimum personal rating slider
- 🔍 **Added**: Include unrated games option

### v1.3.0
- 🎯 **Added**: Advanced weighting system (Random, Favor Old, Favor Unplayed)
- 🕒 **Added**: Last played date integration with BGG Plays API
- ⚖️ **Enhanced**: Intelligent game selection algorithms

### v1.2.0
- 🎨 **Complete**: Modern UI redesign with cosmic theme
- 📱 **Added**: Comprehensive mobile optimization
- ✨ **Added**: Glassmorphism design and animations

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- Data provided by [BoardGameGeek](https://boardgamegeek.com)
- CORS proxies: [AllOrigins](https://allorigins.win), CodeTabs, CORSProxy.io, ThingProxy
- Design inspiration from modern web applications
- Icons and fonts from Google Fonts
- Built with love for the board gaming community

## 📊 Roadmap

- [ ] **Game Recommendations**: AI-powered suggestions based on preferences
- [ ] **Collection Analytics**: Statistics dashboard with insights
- [ ] **Social Features**: Share picks and compare collections
- [ ] **Advanced Filters**: Mechanics, categories, designers, publishers
- [ ] **PWA Support**: Offline usage and app-like experience
- [ ] **Dark Mode**: Alternative theme option
- [ ] **Multi-User**: Support for multiple BGG accounts
- [ ] **Export Features**: Save picks and create gaming sessions

---

**⭐ If you enjoy this project, please give it a star on GitHub! ⭐** 