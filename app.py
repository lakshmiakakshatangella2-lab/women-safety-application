from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from twilio.rest import Client
import os
import requests
from datetime import datetime
from flask_cors import CORS

app = Flask(__name__)
CORS(app, supports_credentials=True)
# Configure SQLite DB
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = 'women-safety-super-secret-key' # Required for session/Flask-Login

db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)

# --- DATABASE MODELS ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    phone = db.Column(db.String(20), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

class Contact(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(100))
    phone = db.Column(db.String(20), nullable=False)

class Feedback(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    email = db.Column(db.String(120))
    message = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class LocationHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Create tables
with app.app_context():
    db.create_all()

# --- ROUTES ---

@app.route('/')
def index():
    return render_template('index.html')

# --- AUTH API ENDPOINTS ---

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json
    username = data.get('username')
    phone = data.get('phone')
    password = data.get('password')

    if User.query.filter_by(username=username).first():
        return jsonify({'status': 'error', 'message': 'Username already exists'})
    
    if User.query.filter_by(phone=phone).first():
        return jsonify({'status': 'error', 'message': 'Phone number already exists'})

    new_user = User(
        username=username,
        phone=phone,
        password_hash=generate_password_hash(password)
    )
    db.session.add(new_user)
    db.session.commit()
    
    login_user(new_user)
    return jsonify({'status': 'success', 'message': 'Signup successful'})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    user = User.query.filter_by(username=username).first()
    if user and check_password_hash(user.password_hash, password):
        login_user(user)
        return jsonify({'status': 'success', 'message': 'Login successful', 'username': user.username})
    
    return jsonify({'status': 'error', 'message': 'Invalid username or password'})

@app.route('/api/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'status': 'success', 'message': 'Logged out successfully'})

@app.route('/api/user', methods=['GET'])
def get_user():
    if current_user.is_authenticated:
        return jsonify({'status': 'success', 'username': current_user.username})
    return jsonify({'status': 'error', 'message': 'Not logged in'})

# --- APP API ENDPOINTS ---

@app.route('/api/contacts', methods=['GET', 'POST'])
@login_required
def handle_contacts():
    if request.method == 'POST':
        data = request.json
        new_contact = Contact(user_id=current_user.id, phone=data.get('phone'), name=data.get('name'))
        db.session.add(new_contact)
        db.session.commit()
        return jsonify({'status': 'success', 'id': new_contact.id})
    
    # GET: return all contacts for this user
    contacts = Contact.query.filter_by(user_id=current_user.id).all()
    out = [{'id': c.id, 'name': c.name, 'phone': c.phone} for c in contacts]
    return jsonify({'status': 'success', 'contacts': out})

@app.route('/api/contacts/<int:contact_id>', methods=['DELETE'])
@login_required
def delete_contact(contact_id):
    contact = Contact.query.filter_by(id=contact_id, user_id=current_user.id).first()
    if contact:
        db.session.delete(contact)
        db.session.commit()
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': 'Contact not found'})

@app.route('/api/feedback', methods=['POST'])
def handle_feedback():
    data = request.json
    fb = Feedback(name=data.get('name'), email=data.get('email'), message=data.get('msg'))
    db.session.add(fb)
    db.session.commit()
    print("Feedback physically stored in database.")
    return jsonify({'status': 'success', 'message': 'Feedback securely stored'})

@app.route('/api/sos', methods=['POST'])
@login_required
def trigger_sos():
    data = request.json
    lat = data.get('lat')
    lng = data.get('lng')
    
    # Log emergency ping in database
    if lat and lng:
        loc = LocationHistory(user_id=current_user.id, latitude=lat, longitude=lng)
        db.session.add(loc)
        db.session.commit()
        
    print(f"🚨 SOS RECEIVED! Backend processing alerts for user {current_user.username} at [{lat}, {lng}]")
    
    # Twilio SMS Dispatching
    twilio_account_sid = os.environ.get('TWILIO_ACCOUNT_SID')
    twilio_auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
    twilio_phone = os.environ.get('TWILIO_PHONE_NUMBER')
    
    # Fetch user contacts from database
    contacts = Contact.query.filter_by(user_id=current_user.id).all()
    contact_numbers = [c.phone for c in contacts]
    
    map_link = f"https://maps.google.com/?q={lat},{lng}" if lat and lng else "Location unavailable"
    sms_body = f"🚨 EMERGENCY! {current_user.username} has triggered an SOS and needs help immediately. Location: {map_link}"
    
    if twilio_account_sid and twilio_auth_token and twilio_phone:
        try:
            client = Client(twilio_account_sid, twilio_auth_token)
            for number in contact_numbers:
                message = client.messages.create(
                    body=sms_body,
                    from_=twilio_phone,
                    to=number
                )
                print(f"SMS sent to {number}. SID: {message.sid}")
        except Exception as e:
            print(f"Failed to send SMS via Twilio: {e}")
            return jsonify({'status': 'error', 'message': f'Emergency triggered, but Twilio SMS failed: {e}'}), 500
            
    fast2sms_api_key = os.environ.get('FAST2SMS_API_KEY')
    if fast2sms_api_key and contact_numbers:
        try:
            url = "https://www.fast2sms.com/dev/bulkV2"
            headers = {
                'authorization': fast2sms_api_key,
                'Content-Type': "application/x-www-form-urlencoded",
                'Cache-Control': "no-cache"
            }
            # Fast2SMS requires numbers comma separated
            numbers_str = ",".join(contact_numbers)
            payload = f"sender_id=TXTIND&message={sms_body}&route=v3&numbers={numbers_str}"
            response = requests.request("POST", url, data=payload, headers=headers)
            print(f"Fast2SMS Response: {response.text}")
            if response.status_code != 200 or not response.json().get('return'):
                return jsonify({'status': 'error', 'message': f"Fast2SMS API Error: {response.text}"}), 500
        except Exception as e:
            print(f"Failed to send SMS via Fast2SMS: {e}")
            return jsonify({'status': 'error', 'message': f'Emergency triggered, but Fast2SMS failed: {e}'}), 500
            
    if not twilio_account_sid and not fast2sms_api_key:
        print(f"Twilio & Fast2SMS credentials missing. SIMULATING SMS TO: {contact_numbers}")
        print(f"MESSAGE: {sms_body}")
        
    return jsonify({'status': 'success', 'message': 'Emergency alerts dispatched successfully.', 'sent_to': contact_numbers})

@app.route('/api/location', methods=['POST'])
@login_required
def update_location():
    data = request.json
    lat = data.get('lat')
    lng = data.get('lng')
    
    if lat and lng:
        loc = LocationHistory(user_id=current_user.id, latitude=lat, longitude=lng)
        db.session.add(loc)
        db.session.commit()
        print(f"Background ping saved [{lat}, {lng}] for user {current_user.username}")

    return jsonify({'status': 'success'})

@app.route('/api/crime_data', methods=['GET'])
def get_crime_data():
    # Endpoint to feed Chart.js data
    data = {
        "labels": ["Harassment", "Robbery", "Kidnapping", "Domestic", "Stalking"],
        "values": [340, 150, 45, 210, 180]
    }
    return jsonify(data)

@app.route('/api/get_locations', methods=['GET'])
@login_required
def get_locations():
    locations = LocationHistory.query.filter_by(user_id=current_user.id).order_by(LocationHistory.timestamp.asc()).all()
    out = [{'lat': loc.latitude, 'lng': loc.longitude, 'timestamp': loc.timestamp.isoformat()} for loc in locations]
    return jsonify({'status': 'success', 'locations': out})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
    from flask import Flask

app = Flask(__name__)

@app.route("/")
def home():
    return "My app is running"

import os

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
