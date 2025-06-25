
(function() {
  'use strict';
  
  // Configuration Supabase
  const SUPABASE_URL = 'https://mhiuwxylsswmlkluvbek.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oaXV3eHlsc3N3bWxrbHV2YmVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA3NjQ3NjEsImV4cCI6MjA2NjM0MDc2MX0.6Va6G97UDqcQTdAQ63jVflQTdHarwPxQ4321o_WOtlc';
  
  // Variables globales
  let agentId = null;
  let chatColor = '#003366';
  let isOpen = false;
  let conversationStep = 0;
  let userType = null; // 'acheteur', 'vendeur', ou 'locataire'
  let leadData = {};
  let agentProfile = null;
  let agentAvailability = null;
  let existingAppointments = [];
  let selectedDate = null;
  let selectedTime = null;
  
  // Récupération des paramètres du script
  function getScriptParams() {
    const scripts = document.querySelectorAll('script');
    let currentScript = null;
    
    for (let script of scripts) {
      if (script.src && script.src.includes('chat.js')) {
        currentScript = script;
        break;
      }
    }
    
    if (currentScript) {
      agentId = currentScript.getAttribute('data-agent-id');
      chatColor = currentScript.getAttribute('data-color') || '#003366';
    }
  }

  // Récupération du profil de l'agent avec ses disponibilités
  async function fetchAgentProfile() {
    if (!agentId) return null;
    
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?agent_id=eq.${agentId}&select=*`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          agentProfile = data[0];
          agentAvailability = {
            working_days: agentProfile.working_days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            working_hours: agentProfile.working_hours || {
              monday: { start: '09:00', end: '18:00' },
              tuesday: { start: '09:00', end: '18:00' },
              wednesday: { start: '09:00', end: '18:00' },
              thursday: { start: '09:00', end: '18:00' },
              friday: { start: '09:00', end: '18:00' }
            },
            default_duration: agentProfile.default_appointment_duration || '1 heure'
          };
          return agentProfile;
        }
      }
    } catch (error) {
      console.error('Erreur lors de la récupération du profil:', error);
    }
    return null;
  }

  // Récupération des rendez-vous existants
  async function fetchExistingAppointments() {
    if (!agentId) return [];
    
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/appointments?agent_id=eq.${agentId}&select=*`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        existingAppointments = data || [];
        return existingAppointments;
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des rendez-vous:', error);
    }
    return [];
  }

  // Utilitaires de date
  function getDayName(date) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getDay()];
  }

  function formatDate(date) {
    return date.toLocaleDateString('fr-FR', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  function addMinutes(time, minutes) {
    const [hours, mins] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + mins + minutes;
    const newHours = Math.floor(totalMinutes / 60);
    const newMins = totalMinutes % 60;
    return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
  }

  function getDurationInMinutes(duration) {
    const durations = {
      '15 minutes': 15,
      '30 minutes': 30,
      '45 minutes': 45,
      '1 heure': 60,
      '1 heure et 15 minutes': 75,
      '1 heure et 30 minutes': 90,
      '1 heure et 45 minutes': 105,
      '2 heures': 120
    };
    return durations[duration] || 60;
  }

  // Calcul des créneaux disponibles
  function getAvailableSlots(date) {
    const dayName = getDayName(date);
    
    if (!agentAvailability.working_days.includes(dayName)) {
      return [];
    }

    const workingHours = agentAvailability.working_hours[dayName];
    if (!workingHours) return [];

    const slots = [];
    const durationMinutes = getDurationInMinutes(agentAvailability.default_duration);
    
    const [startHour, startMin] = workingHours.start.split(':').map(Number);
    const [endHour, endMin] = workingHours.end.split(':').map(Number);
    
    let currentTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;
    
    while (currentTime + durationMinutes <= endTime) {
      const hours = Math.floor(currentTime / 60);
      const minutes = currentTime % 60;
      const timeSlot = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      
      // Vérifier si ce créneau est libre
      const dateStr = date.toISOString().split('T')[0];
      const slotStart = new Date(`${dateStr}T${timeSlot}:00`);
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
      
      const isAvailable = !existingAppointments.some(appointment => {
        const appointmentStart = new Date(appointment.start_time);
        const appointmentEnd = new Date(appointment.end_time);
        
        return (slotStart < appointmentEnd && slotEnd > appointmentStart);
      });
      
      if (isAvailable) {
        slots.push(timeSlot);
      }
      
      currentTime += 30; // Créneaux toutes les 30 minutes
    }
    
    return slots;
  }

  // Obtenir les prochains jours disponibles
  function getAvailableDays() {
    const availableDays = [];
    const today = new Date();
    let currentDate = new Date(today);
    
    // Commencer demain
    currentDate.setDate(currentDate.getDate() + 1);
    
    while (availableDays.length < 4) {
      const dayName = getDayName(currentDate);
      
      if (agentAvailability.working_days.includes(dayName)) {
        const slots = getAvailableSlots(currentDate);
        if (slots.length > 0) {
          availableDays.push({
            date: new Date(currentDate),
            formatted: formatDate(currentDate),
            slots: slots
          });
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
      
      // Éviter une boucle infinie
      if (currentDate > new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)) {
        break;
      }
    }
    
    return availableDays;
  }

  // Génération du message d'accueil personnalisé
  function getWelcomeMessage() {
    let assistantName = "l'assistant virtuel";
    let agencyName = "Agent-Immo";
    
    if (agentProfile) {
      if (agentProfile.assistant_name) {
        assistantName = agentProfile.assistant_name;
      }
      if (agentProfile.agency_name) {
        agencyName = agentProfile.agency_name;
      }
    }
    
    if (agentProfile && agentProfile.assistant_name) {
      return `Bonjour ! Je suis ${assistantName}, l'assistant virtuel de ${agencyName}. Comment puis-je vous aider aujourd'hui ?`;
    } else {
      return `Bonjour ! Je suis l'assistant virtuel de ${agencyName}. Comment puis-je vous aider aujourd'hui ?`;
    }
  }
  
  // Scénarios de conversation
  const scenarios = {
    initial: {
      get message() {
        return getWelcomeMessage();
      },
      options: [
        { text: "Je cherche à acheter un bien", value: "acheteur" },
        { text: "Je souhaite vendre mon bien", value: "vendeur" },
        { text: "Je cherche à louer un bien", value: "locataire" }
      ]
    },
    acheteur: {
      steps: [
        {
          message: "Parfait ! 🏠 Quel type de bien recherchez-vous ?",
          options: [
            { text: "Appartement", value: "appartement" },
            { text: "Maison", value: "maison" },
            { text: "Terrain", value: "terrain" },
            { text: "Commercial", value: "commercial" }
          ]
        },
        {
          message: "Dans quelle ville ou secteur souhaitez-vous acheter ?",
          type: "input",
          placeholder: "Ville ou code postal..."
        },
        {
          message: "Quel est votre budget maximum ?",
          type: "input",
          placeholder: "Ex: 350000 €"
        },
        {
          message: "Avez-vous un commentaire ou une précision à ajouter ? (Optionnel)",
          type: "input",
          placeholder: "Votre commentaire...",
          optional: true
        },
        {
          message: "Excellent ! Pour vous proposer les meilleures opportunités, puis-je avoir vos coordonnées ?",
          fields: [
            { name: "nom", placeholder: "Votre nom", required: true },
            { name: "prenom", placeholder: "Votre prénom", required: true },
            { name: "email", placeholder: "Votre email", required: true },
            { name: "telephone", placeholder: "Votre téléphone", required: true }
          ]
        }
      ]
    },
    vendeur: {
      steps: [
        {
          message: "Excellent ! 🏡 Quel type de bien souhaitez-vous vendre ?",
          options: [
            { text: "Appartement", value: "appartement" },
            { text: "Maison", value: "maison" },
            { text: "Terrain", value: "terrain" },
            { text: "Commercial", value: "commercial" }
          ]
        },
        {
          message: "Dans quelle ville se situe votre bien ?",
          type: "input",
          placeholder: "Ville ou code postal..."
        },
        {
          message: "Quelle est la superficie approximative ?",
          type: "input",
          placeholder: "Superficie en m²..."
        },
        {
          message: "Avez-vous un commentaire ou une précision à ajouter ? (Optionnel)",
          type: "input",
          placeholder: "Votre commentaire...",
          optional: true
        },
        {
          message: "Parfait ! Un de nos experts va vous contacter pour une estimation gratuite. Puis-je avoir vos coordonnées ?",
          fields: [
            { name: "nom", placeholder: "Votre nom", required: true },
            { name: "prenom", placeholder: "Votre prénom", required: true },
            { name: "email", placeholder: "Votre email", required: true },
            { name: "telephone", placeholder: "Votre téléphone", required: true }
          ]
        }
      ]
    },
    locataire: {
      steps: [
        {
          message: "Parfait ! 🏠 Quel type de bien souhaitez-vous louer ?",
          options: [
            { text: "Appartement", value: "appartement" },
            { text: "Maison", value: "maison" },
            { text: "Studio", value: "studio" },
            { text: "Commercial", value: "commercial" }
          ]
        },
        {
          message: "Dans quelle ville ou secteur recherchez-vous ?",
          type: "input",
          placeholder: "Ville ou code postal..."
        },
        {
          message: "Quel est votre budget de loyer maximum (charges comprises) ?",
          type: "input",
          placeholder: "Ex: 1200 €"
        },
        {
          message: "Combien de chambres souhaitez-vous au minimum ?",
          options: [
            { text: "1", value: "1" },
            { text: "2", value: "2" },
            { text: "3", value: "3" },
            { text: "4", value: "4" },
            { text: "5 ou +", value: "5+" }
          ]
        },
        {
          message: "Quelle est la superficie en m² minimum que vous recherchez ?",
          type: "input",
          placeholder: "Ex: 40 m²"
        },
        {
          message: "À partir de quand souhaitez-vous emménager ?",
          type: "input",
          placeholder: "Ex: Immédiatement, dans 2 mois..."
        },
        {
          message: "Avez-vous un commentaire ou une précision à ajouter ? (Optionnel)",
          type: "input",
          placeholder: "Votre commentaire...",
          optional: true
        },
        {
          message: "Parfait ! Nous allons vous proposer les meilleures locations disponibles. Puis-je avoir vos coordonnées ?",
          fields: [
            { name: "nom", placeholder: "Votre nom", required: true },
            { name: "prenom", placeholder: "Votre prénom", required: true },
            { name: "email", placeholder: "Votre email", required: true },
            { name: "telephone", placeholder: "Votre téléphone", required: true }
          ]
        }
      ]
    }
  };
  
  // Client Supabase pour insertion des leads
  async function insertLead(leadData) {
    try {
      console.log('Tentative d\'insertion du lead:', leadData);
      
      const response = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(leadData)
      });
      
      console.log('Statut de la réponse:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Erreur détaillée:', errorText);
        throw new Error(`Erreur ${response.status}: ${errorText}`);
      }
      
      console.log('Lead inséré avec succès');
      return { success: true };
      
    } catch (error) {
      console.error('Erreur lors de l\'insertion du lead:', error);
      throw error;
    }
  }

  // Création du rendez-vous
  async function createAppointment(leadId, startDateTime, endDateTime) {
    try {
      const appointmentData = {
        agent_id: agentId,
        lead_id: leadId,
        title: `RDV - ${leadData.prenom} ${leadData.nom}`,
        description: `Type: ${leadData.type}\nEmail: ${leadData.email}\nTéléphone: ${leadData.telephone}`,
        type: leadData.type,
        start_time: startDateTime,
        end_time: endDateTime,
        status: 'En attente'
      };

      const response = await fetch(`${SUPABASE_URL}/rest/v1/appointments`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(appointmentData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Erreur lors de la création du RDV:', errorText);
        throw new Error(`Erreur ${response.status}: ${errorText}`);
      }

      console.log('Rendez-vous créé avec succès');
      return { success: true };

    } catch (error) {
      console.error('Erreur lors de la création du rendez-vous:', error);
      throw error;
    }
  }
  
  // Création de l'interface
  function createChatWidget() {
    // Styles CSS
    const styles = `
      #agent-immo-chat {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      #agent-immo-bubble {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: ${chatColor};
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        transition: all 0.3s ease;
      }
      
      #agent-immo-bubble:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 25px rgba(0,0,0,0.2);
      }
      
      #agent-immo-bubble svg {
        width: 24px;
        height: 24px;
        fill: white;
      }
      
      #agent-immo-window {
        position: absolute;
        bottom: 80px;
        right: 0;
        width: 350px;
        height: 500px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        display: none;
        flex-direction: column;
        overflow: hidden;
      }
      
      #agent-immo-header {
        background: ${chatColor};
        color: white;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      
      #agent-immo-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
      
      #agent-immo-close {
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      #agent-immo-messages {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
        background: #f8f9fa;
      }
      
      .agent-message {
        background: white;
        padding: 12px 16px;
        border-radius: 18px 18px 18px 4px;
        margin-bottom: 16px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        animation: slideIn 0.3s ease;
      }
      
      .user-message {
        background: ${chatColor};
        color: white;
        padding: 12px 16px;
        border-radius: 18px 18px 4px 18px;
        margin-bottom: 16px;
        margin-left: 40px;
        animation: slideIn 0.3s ease;
      }
      
      .chat-options {
        margin-top: 12px;
      }
      
      .chat-option {
        display: block;
        width: 100%;
        background: ${chatColor};
        color: white;
        border: none;
        padding: 10px 16px;
        margin-bottom: 8px;
        border-radius: 20px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s ease;
      }
      
      .chat-option:hover {
        opacity: 0.9;
        transform: translateY(-1px);
      }
      
      .chat-option.appointment-action {
        background: #28a745;
      }
      
      .chat-option.appointment-action:hover {
        background: #218838;
      }
      
      .chat-option.maybe-later {
        background: #6c757d;
      }
      
      .chat-option.maybe-later:hover {
        background: #5a6268;
      }
      
      .chat-input-group {
        margin-top: 12px;
      }
      
      .chat-input {
        width: 100%;
        padding: 10px 16px;
        border: 2px solid #e2e8f0;
        border-radius: 20px;
        margin-bottom: 8px;
        font-size: 14px;
        box-sizing: border-box;
      }
      
      .chat-input:focus {
        outline: none;
        border-color: ${chatColor};
      }
      
      .chat-submit {
        background: ${chatColor};
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 20px;
        cursor: pointer;
        font-size: 14px;
        margin-top: 8px;
      }
      
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      @media (max-width: 480px) {
        #agent-immo-window {
          width: calc(100vw - 40px);
          height: calc(100vh - 100px);
          bottom: 80px;
          right: 20px;
        }
      }
    `;
    
    // Injection des styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
    
    // Création du widget
    const chatWidget = document.createElement('div');
    chatWidget.id = 'agent-immo-chat';
    chatWidget.innerHTML = `
      <div id="agent-immo-bubble">
        <svg viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>
      </div>
      
      <div id="agent-immo-window">
        <div id="agent-immo-header">
          <h3>Agent-Immo Assistant</h3>
          <button id="agent-immo-close">×</button>
        </div>
        <div id="agent-immo-messages"></div>
      </div>
    `;
    
    document.body.appendChild(chatWidget);
    
    // Event listeners
    document.getElementById('agent-immo-bubble').addEventListener('click', toggleChat);
    document.getElementById('agent-immo-close').addEventListener('click', closeChat);
    
    // Démarrage de la conversation
    startConversation();
  }
  
  function toggleChat() {
    isOpen = !isOpen;
    const window = document.getElementById('agent-immo-window');
    window.style.display = isOpen ? 'flex' : 'none';
  }
  
  function closeChat() {
    isOpen = false;
    document.getElementById('agent-immo-window').style.display = 'none';
  }
  
  function addMessage(message, isUser = false) {
    const messagesContainer = document.getElementById('agent-immo-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = isUser ? 'user-message' : 'agent-message';
    messageDiv.textContent = message;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  function addOptions(options, callback) {
    const messagesContainer = document.getElementById('agent-immo-messages');
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'chat-options';
    
    options.forEach(option => {
      const button = document.createElement('button');
      button.className = option.class ? `chat-option ${option.class}` : 'chat-option';
      button.textContent = option.text;
      button.addEventListener('click', () => {
        addMessage(option.text, true);
        optionsDiv.remove();
        callback(option.value);
      });
      optionsDiv.appendChild(button);
    });
    
    messagesContainer.appendChild(optionsDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  function addInput(placeholder, callback, optional = false) {
    const messagesContainer = document.getElementById('agent-immo-messages');
    const inputDiv = document.createElement('div');
    inputDiv.className = 'chat-input-group';
    
    const input = document.createElement('input');
    input.className = 'chat-input';
    input.placeholder = placeholder;
    input.type = 'text';
    
    const button = document.createElement('button');
    button.className = 'chat-submit';
    button.textContent = optional ? 'Continuer' : 'Envoyer';
    
    const handleSubmit = () => {
      const value = input.value.trim();
      if (value || optional) {
        if (value) {
          addMessage(value, true);
        } else if (optional) {
          addMessage("Aucun commentaire", true);
        }
        inputDiv.remove();
        callback(value || null);
      }
    };
    
    button.addEventListener('click', handleSubmit);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSubmit();
    });
    
    inputDiv.appendChild(input);
    inputDiv.appendChild(button);
    messagesContainer.appendChild(inputDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    setTimeout(() => input.focus(), 100);
  }
  
  function addForm(fields, callback) {
    const messagesContainer = document.getElementById('agent-immo-messages');
    const formDiv = document.createElement('div');
    formDiv.className = 'chat-input-group';
    
    const inputs = {};
    
    fields.forEach(field => {
      const input = document.createElement('input');
      input.className = 'chat-input';
      input.placeholder = field.placeholder;
      input.type = field.name === 'email' ? 'email' : 'text';
      input.required = field.required;
      inputs[field.name] = input;
      formDiv.appendChild(input);
    });
    
    const button = document.createElement('button');
    button.className = 'chat-submit';
    button.textContent = 'Envoyer';
    
    const handleSubmit = () => {
      const data = {};
      let valid = true;
      
      fields.forEach(field => {
        const value = inputs[field.name].value.trim();
        if (field.required && !value) {
          valid = false;
          inputs[field.name].style.borderColor = '#ef4444';
        } else {
          inputs[field.name].style.borderColor = '#e2e8f0';
          data[field.name] = value;
        }
      });
      
      if (valid) {
        addMessage(`Merci ${data.prenom} ! Vos informations ont été enregistrées.`, false);
        formDiv.remove();
        callback(data);
      }
    };
    
    button.addEventListener('click', handleSubmit);
    formDiv.appendChild(button);
    messagesContainer.appendChild(formDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    setTimeout(() => inputs[fields[0].name].focus(), 100);
  }
  
  async function startConversation() {
    // Récupérer le profil de l'agent avant de démarrer la conversation
    agentProfile = await fetchAgentProfile();
    
    setTimeout(() => {
      addMessage(scenarios.initial.message);
      addOptions(scenarios.initial.options, handleUserType);
    }, 1000);
  }
  
  function handleUserType(type) {
    userType = type;
    leadData.type = type;
    conversationStep = 0;
    processNextStep();
  }
  
  function processNextStep() {
    const scenario = scenarios[userType];
    const step = scenario.steps[conversationStep];
    
    if (!step) {
      proposeAppointment();
      return;
    }
    
    setTimeout(() => {
      addMessage(step.message);
      
      if (step.options) {
        addOptions(step.options, (value) => {
          leadData[`step_${conversationStep}`] = value;
          conversationStep++;
          processNextStep();
        });
      } else if (step.type === 'input') {
        addInput(step.placeholder, (value) => {
          if (step.optional && !value) {
            // Étape optionnelle ignorée, pas de sauvegarde
          } else if (step.optional && value) {
            leadData.commentaire = value;
          } else {
            leadData[`step_${conversationStep}`] = value;
          }
          conversationStep++;
          processNextStep();
        }, step.optional);
      } else if (step.fields) {
        addForm(step.fields, (data) => {
          Object.assign(leadData, data);
          conversationStep++;
          processNextStep();
        });
      }
    }, 1000);
  }

  // Proposer un rendez-vous ou terminer
  function proposeAppointment() {
    setTimeout(() => {
      addMessage("Souhaiteriez-vous prendre rendez-vous pour discuter de votre projet ?");
      addOptions([
        { text: "Oui, je veux prendre rendez-vous", value: "appointment", class: "appointment-action" },
        { text: "Peut-être plus tard", value: "later", class: "maybe-later" }
      ], (choice) => {
        if (choice === "appointment") {
          startAppointmentProcess();
        } else {
          finishConversationWithoutAppointment();
        }
      });
    }, 1000);
  }

  // Démarrer le processus de prise de rendez-vous
  async function startAppointmentProcess() {
    // Récupérer les rendez-vous existants
    await fetchExistingAppointments();
    
    // Obtenir les jours disponibles
    const availableDays = getAvailableDays();
    
    if (availableDays.length === 0) {
      setTimeout(() => {
        addMessage("Désolé, aucun créneau n'est disponible dans les prochains jours. Nos équipes vous contacteront directement pour convenir d'un rendez-vous.");
        finishConversationWithoutAppointment();
      }, 1000);
      return;
    }

    setTimeout(() => {
      addMessage("Parfait ! Quel jour vous conviendrait le mieux ?");
      
      const dayOptions = availableDays.map(day => ({
        text: day.formatted,
        value: day.date.toISOString().split('T')[0]
      }));
      
      addOptions(dayOptions, (selectedDateStr) => {
        selectedDate = new Date(selectedDateStr);
        showAvailableTimeSlots();
      });
    }, 1000);
  }

  // Afficher les créneaux horaires disponibles
  function showAvailableTimeSlots() {
    const slots = getAvailableSlots(selectedDate);
    
    if (slots.length === 0) {
      setTimeout(() => {
        addMessage("Désolé, aucun créneau n'est disponible pour cette date. Veuillez choisir un autre jour.");
        startAppointmentProcess();
      }, 1000);
      return;
    }

    setTimeout(() => {
      addMessage("Quelle heure vous conviendrait ?");
      
      const timeOptions = slots.slice(0, 6).map(time => ({
        text: time,
        value: time
      }));
      
      addOptions(timeOptions, (time) => {
        selectedTime = time;
        confirmAppointment();
      });
    }, 1000);
  }

  // Confirmer et créer le rendez-vous
  async function confirmAppointment() {
    try {
      // D'abord créer le lead
      const leadToSave = {
        agent_id: agentId,
        type: leadData.type,
        nom: leadData.nom,
        prenom: leadData.prenom,
        email: leadData.email,
        telephone: leadData.telephone,
        details: leadData,
        source: 'widget-chat',
        commentaire: leadData.commentaire || null
      };

      await insertLead(leadToSave);

      // Puis créer le rendez-vous
      const durationMinutes = getDurationInMinutes(agentAvailability.default_duration);
      const startDateTime = new Date(selectedDate);
      const [hours, minutes] = selectedTime.split(':').map(Number);
      startDateTime.setHours(hours, minutes, 0, 0);
      
      const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60000);

      await createAppointment(null, startDateTime.toISOString(), endDateTime.toISOString());

      // Message de confirmation
      setTimeout(() => {
        const formattedDate = formatDate(selectedDate);
        addMessage(`Parfait ! Votre rendez-vous est confirmé pour le ${formattedDate} à ${selectedTime}. Vous recevrez une confirmation par email. À bientôt ! 📅✨`);
      }, 1000);

    } catch (error) {
      console.error('Erreur lors de la création du rendez-vous:', error);
      setTimeout(() => {
        addMessage("Une erreur s'est produite lors de la prise de rendez-vous. Nos équipes vous contacteront directement pour programmer votre rendez-vous. Merci pour votre compréhension !");
      }, 1000);
    }
  }
  
  async function finishConversationWithoutAppointment() {
    try {
      // Validation de l'agent_id
      if (!agentId) {
        console.error('Agent ID manquant');
        addMessage("Merci pour vos informations ! Notre équipe va vous contacter rapidement.");
        return;
      }
      
      // Préparation des données du lead
      const leadToSave = {
        agent_id: agentId,
        type: leadData.type,
        nom: leadData.nom,
        prenom: leadData.prenom,
        email: leadData.email,
        telephone: leadData.telephone,
        details: leadData,
        source: 'widget-chat',
        commentaire: leadData.commentaire || null
      };
      
      console.log('Données à sauvegarder:', leadToSave);
      
      // Sauvegarde en base de données
      await insertLead(leadToSave);
      
      // Message de fin personnalisé selon le type
      setTimeout(() => {
        if (userType === 'acheteur') {
          addMessage("Parfait ! Nos experts vont analyser votre demande et vous contacter rapidement avec des biens correspondant à vos critères. À très bientôt ! 🏠✨");
        } else if (userType === 'vendeur') {
          addMessage("Excellent ! Un de nos experts va vous contacter dans les plus brefs délais pour organiser une visite et vous proposer une estimation gratuite. À très bientôt ! 🏡📞");
        } else if (userType === 'locataire') {
          addMessage(`Merci ${leadData.prenom} ! Vos informations ont été enregistrées.`);
          setTimeout(() => {
            addMessage("Parfait ! Vous serez alerté(e) dès qu'un bien correspondant à vos critères sera disponible. Bonne recherche ! 🔑✨");
          }, 1500);
        }
      }, 1000);
      
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du lead:', error);
      addMessage("Merci pour vos informations ! Notre équipe va vous contacter rapidement.");
    }
  }
  
  // Initialisation
  async function init() {
    // Attendre que le DOM soit chargé
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        getScriptParams();
        createChatWidget();
      });
    } else {
      getScriptParams();
      createChatWidget();
    }
  }
  
  // Démarrage
  init();
  
})();
